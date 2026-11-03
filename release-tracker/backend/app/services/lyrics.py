"""Inventaire et completion des paroles de la bibliotheque (onglet Lyrics).

Deux traitements longs, lances a la demande depuis l'UI et executes dans un
thread d'arriere-plan (un seul a la fois, progression exposee via
get_job_state() et sondee par le frontend) :

- scan_library() : parcourt la bibliotheque (Settings.tagging_library_path, en
  excluant le dossier de telechargements qui releve du Backlog) et classe
  chaque piste en "missing" (aucune parole), "plain" (paroles sans time code)
  ou "synced" (paroles avec time code). Sont pris en compte les tags embarques
  (ID3 USLT/SYLT, Vorbis LYRICS, MP4 ©lyr) et les fichiers .lrc/.txt poses a
  cote de la piste - les memes sources que celles lues par Navidrome.
- update_lyrics() : pour chaque piste "missing" ou "plain", interroge lrclib.net
  et ecrit un fichier .lrc a cote de la piste si des paroles synchronisees
  sont trouvees (ou, pour une piste sans aucune parole, des paroles brutes a
  defaut). Les fichiers audio eux-memes ne sont jamais modifies : un .lrc
  est prioritaire sur les tags embarques dans Navidrome, et ca evite de
  toucher a des fichiers deja tagges par Picard.
"""

import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import LyricsStatus, LyricsTrack, Settings
from .tagging import AUDIO_EXTENSIONS

logger = logging.getLogger("dedieufy.lyrics")

LRCLIB_URL = "https://lrclib.net/api"
LRCLIB_HEADERS = {"User-Agent": "MusicReleasarr/1.0 ( self-hosted )"}
# Une piste deja cherchee sans succes n'est pas re-demandee a lrclib avant ce
# delai (sauf mise a jour forcee) - sinon chaque mise a jour repasserait des
# milliers de titres introuvables pour rien.
LOOKUP_RETRY_DELAY = timedelta(days=7)
# Ecart de duree tolere entre le fichier et un resultat de recherche lrclib :
# au-dela, le time code a toutes les chances d'etre decale (autre version).
DURATION_TOLERANCE_S = 3
COMMIT_EVERY = 200
# Erreurs passageres lrclib (limitation de debit, serveur surcharge, reseau) :
# retentees quelques fois avec un delai croissant avant d'abandonner le titre.
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 3
RETRY_BACKOFF_S = 2
SIDECAR_EXTENSIONS = (".lrc", ".txt")

_SYNCED_RE = re.compile(r"^\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]", re.MULTILINE)

_job_lock = threading.Lock()
_job_state: dict = {
    "kind": None,
    "running": False,
    "processed": 0,
    "total": 0,
    "updated": 0,
    "not_found": 0,
    "errors": 0,
    "started_at": None,
    "finished_at": None,
    "message": None,
    "cancel_requested": False,
}


def get_job_state() -> dict:
    with _job_lock:
        return dict(_job_state)


def _set_state(**changes) -> None:
    with _job_lock:
        _job_state.update(changes)


def _cancel_requested() -> bool:
    with _job_lock:
        return _job_state["cancel_requested"]


def request_cancel() -> bool:
    with _job_lock:
        if not _job_state["running"]:
            return False
        _job_state["cancel_requested"] = True
        return True


def start_job(kind: str, target, *args) -> bool:
    """Lance `target(*args)` dans un thread si aucun traitement n'est deja en
    cours - renvoie False sinon (le routeur repond alors 409)."""
    with _job_lock:
        if _job_state["running"]:
            return False
        _job_state.update(
            kind=kind,
            running=True,
            processed=0,
            total=0,
            updated=0,
            not_found=0,
            errors=0,
            started_at=datetime.utcnow(),
            finished_at=None,
            message=None,
            cancel_requested=False,
        )

    def runner():
        try:
            target(*args)
        except Exception as exc:
            logger.exception("Echec du traitement lyrics (%s)", kind)
            _set_state(message=f"Échec : {exc}")
        finally:
            _set_state(running=False, finished_at=datetime.utcnow())

    threading.Thread(target=runner, name=f"lyrics-{kind}", daemon=True).start()
    return True


# --- Detection --------------------------------------------------------------


def _is_synced(text: str | None) -> bool:
    return bool(text and _SYNCED_RE.search(text))


def _first_text(tags, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        try:
            value = tags.get(key)
        except Exception:
            value = None
        if value is None:
            continue
        if hasattr(value, "text"):  # frame ID3
            value = value.text
        if isinstance(value, (list, tuple)):
            value = value[0] if value else None
        if value:
            return str(value).strip() or None
    return None


def _embedded_lyrics(tags) -> tuple[bool, bool]:
    """(a des paroles, sont synchronisees) d'apres les tags embarques."""
    if tags is None:
        return False, False

    if hasattr(tags, "getall"):  # ID3 (mp3, et wav/aiff tagges en ID3)
        if any(frame.text for frame in tags.getall("SYLT")):
            return True, True
        texts = [frame.text for frame in tags.getall("USLT") if frame.text and frame.text.strip()]
        return bool(texts), any(_is_synced(t) for t in texts)

    texts: list[str] = []
    for key in ("lyrics", "LYRICS", "unsyncedlyrics", "UNSYNCEDLYRICS", "syncedlyrics", "SYNCEDLYRICS", "\xa9lyr"):
        try:
            value = tags.get(key)
        except Exception:
            value = None
        if not value:
            continue
        values = value if isinstance(value, (list, tuple)) else [value]
        texts.extend(str(v) for v in values if v and str(v).strip())
    return bool(texts), any(_is_synced(t) for t in texts)


def _sidecar_paths(path: str) -> list[str]:
    stem = os.path.splitext(path)[0]
    return [stem + ext for ext in SIDECAR_EXTENSIONS if os.path.isfile(stem + ext)]


def _sidecar_mtime(path: str) -> float:
    return max((os.path.getmtime(p) for p in _sidecar_paths(path)), default=0.0)


def _classify(path: str) -> dict:
    """Lit tags + fichiers .lrc/.txt d'une piste et renvoie les champs a
    enregistrer sur sa ligne LyricsTrack."""
    from mutagen import File as MutagenFile

    result = {"artist": None, "title": None, "album": None, "duration": None, "status": LyricsStatus.missing, "source": None}

    has_embedded, embedded_synced = False, False
    try:
        audio = MutagenFile(path)
    except Exception:
        logger.warning("Lecture des tags impossible : %s", path)
        audio = None
    if audio is not None:
        tags = audio.tags
        if tags is not None:
            result["artist"] = _first_text(tags, ("TPE1", "\xa9ART", "artist", "ARTIST"))
            result["title"] = _first_text(tags, ("TIT2", "\xa9nam", "title", "TITLE"))
            result["album"] = _first_text(tags, ("TALB", "\xa9alb", "album", "ALBUM"))
        if getattr(audio, "info", None) is not None and getattr(audio.info, "length", None):
            result["duration"] = float(audio.info.length)
        has_embedded, embedded_synced = _embedded_lyrics(tags)

    sidecar_status: LyricsStatus | None = None
    sidecar_source: str | None = None
    for sidecar in _sidecar_paths(path):
        try:
            with open(sidecar, encoding="utf-8", errors="replace") as f:
                content = f.read()
        except OSError:
            continue
        if not content.strip():
            continue
        status = LyricsStatus.synced if _is_synced(content) else LyricsStatus.plain
        if sidecar_status is None or status == LyricsStatus.synced:
            sidecar_status = status
            sidecar_source = os.path.splitext(sidecar)[1].lstrip(".").lower()

    if sidecar_status == LyricsStatus.synced:
        result["status"], result["source"] = LyricsStatus.synced, sidecar_source
    elif embedded_synced:
        result["status"], result["source"] = LyricsStatus.synced, "embedded"
    elif sidecar_status == LyricsStatus.plain:
        result["status"], result["source"] = LyricsStatus.plain, sidecar_source
    elif has_embedded:
        result["status"], result["source"] = LyricsStatus.plain, "embedded"

    if not result["title"]:
        # Pas de tag titre : repli sur le nom de fichier, sans numero de piste.
        stem = os.path.splitext(os.path.basename(path))[0]
        result["title"] = re.sub(r"^\s*\d{1,3}\s*[.\-)]\s*", "", stem).strip() or stem
    return result


def _apply_classification(row: LyricsTrack, path: str) -> None:
    for key, value in _classify(path).items():
        setattr(row, key, value)
    row.file_mtime = os.path.getmtime(path)
    row.sidecar_mtime = _sidecar_mtime(path)
    row.scanned_at = datetime.utcnow()


def _iter_library_files(library_root: str, excluded_root: str | None):
    excluded = os.path.normpath(excluded_root) if excluded_root else None
    for dirpath, dirnames, filenames in os.walk(library_root):
        if excluded and os.path.normpath(dirpath) == excluded:
            dirnames[:] = []
            continue
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for filename in sorted(filenames):
            if filename.startswith("."):
                continue
            if os.path.splitext(filename)[1].lower() in AUDIO_EXTENSIONS:
                yield os.path.join(dirpath, filename)


# --- Scan -------------------------------------------------------------------


def scan_library(force: bool = False) -> None:
    with SessionLocal() as db:
        settings = db.query(Settings).first()
        library_root = settings.tagging_library_path
        downloads_root = settings.tagging_downloads_path
        if not os.path.isdir(library_root):
            _set_state(message=f"Dossier de bibliothèque introuvable : {library_root}")
            return

        _set_state(message="Inventaire des fichiers...")
        paths = list(_iter_library_files(library_root, downloads_root))
        _set_state(total=len(paths), message=None)

        existing = {row.path: row for row in db.query(LyricsTrack).all()}
        seen: set[str] = set()
        changed = 0

        for idx, path in enumerate(paths, start=1):
            if _cancel_requested():
                db.commit()
                _set_state(message="Scan annulé")
                return
            seen.add(path)
            try:
                file_mtime = os.path.getmtime(path)
                sidecar_mtime = _sidecar_mtime(path)
                row = existing.get(path)
                if (
                    row is not None
                    and not force
                    and row.file_mtime == file_mtime
                    and row.sidecar_mtime == sidecar_mtime
                ):
                    continue
                if row is None:
                    row = LyricsTrack(path=path)
                    db.add(row)
                _apply_classification(row, path)
                changed += 1
            except Exception:
                logger.exception("Echec de l'analyse lyrics pour %s", path)
                _set_state(errors=get_job_state()["errors"] + 1)
            finally:
                _set_state(processed=idx, updated=changed)
            if changed and changed % COMMIT_EVERY == 0:
                db.commit()

        removed = 0
        for path, row in existing.items():
            if path not in seen:
                db.delete(row)
                removed += 1
        db.commit()
        _set_state(message=f"{len(paths)} piste(s) analysée(s), {changed} mise(s) à jour, {removed} retirée(s)")


# --- Mise a jour via lrclib -------------------------------------------------


def _lrclib_request(client: httpx.Client, endpoint: str, params: dict) -> httpx.Response:
    # Sur /get, un 503 vient de la recherche externe de lrclib, saturee
    # durablement : inutile de la retenter (voir find_lyrics).
    retry_codes = RETRY_STATUS_CODES - {503} if endpoint == "get" else RETRY_STATUS_CODES
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            resp = client.get(f"{LRCLIB_URL}/{endpoint}", params=params)
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == MAX_ATTEMPTS:
                raise
        else:
            if resp.status_code not in retry_codes or attempt == MAX_ATTEMPTS:
                return resp
            retry_after = resp.headers.get("retry-after")
            if retry_after and retry_after.isdigit():
                time.sleep(min(int(retry_after), 60))
                continue
        time.sleep(RETRY_BACKOFF_S * attempt)
    raise RuntimeError("unreachable")


def describe_error(exc: Exception) -> tuple[str, str]:
    """(categorie regroupable, detail) d'une erreur de mise a jour - la
    categorie ne contient ni chemin ni titre pour pouvoir compter les
    occurrences d'une meme cause dans l'UI."""
    detail = f"{type(exc).__name__}: {exc}"
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code} lrclib", detail
    if isinstance(exc, httpx.TimeoutException):
        return "Timeout lrclib", detail
    if isinstance(exc, httpx.TransportError):
        return f"Réseau lrclib ({type(exc).__name__})", detail
    if isinstance(exc, PermissionError):
        return "Écriture du .lrc refusée (permissions)", detail
    if isinstance(exc, OSError):
        return f"Écriture du .lrc impossible ({exc.strerror or type(exc).__name__})", detail
    if isinstance(exc, ValueError):
        return "Réponse lrclib invalide", detail
    return type(exc).__name__, detail


def _lrclib_get(
    client: httpx.Client, endpoint: str, artist: str, title: str, album: str | None, duration: float | None
) -> dict | None:
    params = {"artist_name": artist, "track_name": title}
    if album:
        params["album_name"] = album
    if duration:
        params["duration"] = int(round(duration))
    resp = _lrclib_request(client, endpoint, params)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def _lrclib_search(client: httpx.Client, artist: str, title: str, duration: float | None) -> list[dict]:
    resp = _lrclib_request(client, "search", {"artist_name": artist, "track_name": title})
    resp.raise_for_status()
    results = [r for r in resp.json() if not r.get("instrumental")]
    if duration:
        results = [r for r in results if r.get("duration") and abs(r["duration"] - duration) <= DURATION_TOLERANCE_S]
        results.sort(key=lambda r: abs(r["duration"] - duration))
    return results


def _pick(record: dict | None, plain: str | None) -> tuple[str | None, str | None]:
    if not record or record.get("instrumental"):
        return None, plain
    if record.get("syncedLyrics"):
        return record["syncedLyrics"], record.get("plainLyrics") or plain
    return None, plain or record.get("plainLyrics") or None


def find_lyrics(client: httpx.Client, artist: str, title: str, album: str | None, duration: float | None) -> tuple[str | None, str | None]:
    """(paroles synchronisees LRC, paroles brutes), en trois temps :

    1. /get-cached : correspondance exacte dans la base lrclib (artiste/titre/
       album/duree), sans recherche externe - rapide et fiable.
    2. /search : recherche plus large, filtree sur la duree du fichier.
    3. /get : correspondance exacte AVEC recherche externe par lrclib, en
       dernier recours seulement - cette recherche externe est souvent
       saturee et repond alors 503 "ServerOverloaded", qu'on traite comme
       "introuvable" plutot que comme une erreur (c'etait la cause de la
       majorite des titres en erreur quand /get etait interroge en premier).
    """
    synced, plain = _pick(_lrclib_get(client, "get-cached", artist, title, album, duration), None)
    if synced:
        return synced, plain

    for result in _lrclib_search(client, artist, title, duration):
        synced, plain = _pick(result, plain)
        if synced:
            return synced, plain

    try:
        return _pick(_lrclib_get(client, "get", artist, title, album, duration), plain)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 503:
            return None, plain
        raise


def _write_sidecar(path: str, content: str) -> None:
    lrc_path = os.path.splitext(path)[0] + ".lrc"
    with open(lrc_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")


def update_candidates_query(db: Session, force: bool = False):
    query = db.query(LyricsTrack).filter(LyricsTrack.status.in_([LyricsStatus.missing, LyricsStatus.plain]))
    if not force:
        cutoff = datetime.utcnow() - LOOKUP_RETRY_DELAY
        # Les erreurs (reseau, permissions...) ne disent rien de la disponibilite
        # des paroles : elles sont retentees a chaque mise a jour, contrairement
        # aux titres reellement introuvables.
        query = query.filter(
            (LyricsTrack.lookup_at.is_(None))
            | (LyricsTrack.lookup_at < cutoff)
            | (LyricsTrack.lookup_result == "error")
        )
    return query


def update_lyrics(force: bool = False) -> None:
    from . import navidrome

    with SessionLocal() as db:
        rows = update_candidates_query(db, force).order_by(LyricsTrack.path).all()
        _set_state(total=len(rows))
        updated = not_found = errors = 0

        with httpx.Client(timeout=15, headers=LRCLIB_HEADERS) as client:
            for idx, row in enumerate(rows, start=1):
                if _cancel_requested():
                    _set_state(message="Mise à jour annulée")
                    break
                row.lookup_error = row.lookup_error_detail = None
                try:
                    if not os.path.isfile(row.path):
                        db.delete(row)
                        continue
                    if not row.artist or not row.title:
                        row.lookup_result = "no_tags"
                        not_found += 1
                        continue

                    synced, plain = find_lyrics(client, row.artist, row.title, row.album, row.duration)
                    if synced:
                        _write_sidecar(row.path, synced)
                        row.lookup_result = "synced"
                        updated += 1
                    elif plain and row.status == LyricsStatus.missing:
                        _write_sidecar(row.path, plain)
                        row.lookup_result = "plain"
                        updated += 1
                    else:
                        row.lookup_result = "not_found"
                        not_found += 1
                    if row.lookup_result in ("synced", "plain"):
                        _apply_classification(row, row.path)
                except Exception as exc:
                    category, detail = describe_error(exc)
                    logger.warning("Echec de la recherche de paroles pour %s : %s", row.path, detail)
                    row.lookup_result = "error"
                    row.lookup_error = category
                    row.lookup_error_detail = detail
                    errors += 1
                finally:
                    if row in db:
                        row.lookup_at = datetime.utcnow()
                    _set_state(processed=idx, updated=updated, not_found=not_found, errors=errors)
                if idx % 50 == 0:
                    db.commit()
                # Service gratuit et communautaire : on reste raisonnable.
                time.sleep(0.2)
        db.commit()

        message = f"{updated} piste(s) complétée(s), {not_found} sans résultat, {errors} erreur(s)"
        settings = db.query(Settings).first()
        if updated and settings.navidrome_url and settings.navidrome_username and settings.navidrome_password:
            # Navidrome ne voit les nouveaux .lrc qu'apres un scan de la bibliotheque.
            ok, _ = navidrome.start_scan(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
            if ok:
                message += " - scan Navidrome lancé"
        if not _cancel_requested():
            _set_state(message=message)
