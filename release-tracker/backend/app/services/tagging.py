"""Pipeline "redressage metadata + rangement" post-telechargement MeTube.

MeTube depose ses telechargements dans un seul dossier par ARTISTE (voir
services/metube.py + scheduler.py:224 : folder=normalize_text(artist.name)),
pas par release - plusieurs albums d'un meme artiste peuvent donc partager le
meme dossier source. scan_artist() traite ainsi tout le dossier d'un artiste
d'un coup, en repartissant les fichiers detectes entre les tracklists
MusicBrainz de toutes ses releases "downloaded" (correspondance gloutonne par
similarite de titre).

Volontairement, aucune fonction ici n'ecrit de tag ni ne deplace de fichier
sans qu'un TaggingItem soit explicitement confirme via l'API (routers/tagging.py) :
un retour d'experience utilisateur indique qu'un tagging 100% automatique
produisait des doublons d'album (tags incoherents entre pistes d'un meme
album). scan_artist()/rescan_item() ne font donc que proposer une
correspondance ; seul apply_tag_and_move() ecrit sur le disque, et uniquement
a la demande explicite de l'utilisateur.
"""

import logging
import os
import re
import shutil

import httpx
from sqlalchemy.orm import Session

from ..matching import normalize_text, similarity
from ..models import Artist, DownloadStatus, Release, Settings, TaggingItem, TaggingStatus
from . import musicbrainz

logger = logging.getLogger("dedieufy.tagging")

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".flac", ".opus", ".ogg", ".wav"}

# Suffixes parasites frequents dans les titres de videos YouTube, a retirer avant
# comparaison avec le titre de piste MusicBrainz (ex: "Song Title (Official Audio)").
_NOISE_RE = re.compile(
    r"[\(\[][^)\]]*(official|audio|video|lyric|visualizer|hd|4k|remaster\w*)[^)\]]*[\)\]]",
    re.IGNORECASE,
)
_TOPIC_SUFFIX_RE = re.compile(r"\s*[-–]\s*topic$", re.IGNORECASE)
_INVALID_FS_CHARS_RE = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def _clean_filename(filename: str) -> str:
    stem = os.path.splitext(filename)[0]
    stem = _NOISE_RE.sub("", stem)
    stem = _TOPIC_SUFFIX_RE.sub("", stem)
    return stem.strip()


def _iter_audio_files(folder: str) -> list[str]:
    return sorted(
        os.path.join(folder, entry)
        for entry in os.listdir(folder)
        if os.path.splitext(entry)[1].lower() in AUDIO_EXTENSIONS
        and os.path.isfile(os.path.join(folder, entry))
    )


def sanitize_component(name: str) -> str:
    cleaned = _INVALID_FS_CHARS_RE.sub("", name).strip(" .")
    return cleaned or "Inconnu"


def scan_artist(db: Session, settings: Settings, artist: Artist) -> list[TaggingItem]:
    """Detecte les nouveaux fichiers audio du dossier de telechargement de cet
    artiste et cree une entree de backlog par fichier, avec une proposition de
    correspondance (piste + release) parmi ses releases "downloaded"."""
    folder = os.path.join(settings.tagging_downloads_path, normalize_text(artist.name))
    if not os.path.isdir(folder):
        return []

    already_tracked = {
        path
        for (path,) in db.query(TaggingItem.source_path)
        .join(Release, TaggingItem.release_id == Release.id)
        .filter(Release.artist_id == artist.id)
        .all()
    }
    new_files = [p for p in _iter_audio_files(folder) if p not in already_tracked]
    if not new_files:
        return []

    releases = (
        db.query(Release)
        .filter(Release.artist_id == artist.id, Release.download_status == DownloadStatus.downloaded)
        .all()
    )
    if not releases:
        return []

    candidates: list[tuple[Release, dict]] = []
    for release in releases:
        try:
            tracks = musicbrainz.get_release_tracks(release.musicbrainz_id, expected_track_count=len(new_files))
        except Exception:
            logger.exception("Tracklist MusicBrainz indisponible pour %s - %s", artist.name, release.title)
            continue
        candidates.extend((release, track) for track in tracks)

    created: list[TaggingItem] = []
    for path in new_files:
        cleaned = normalize_text(_clean_filename(os.path.basename(path)))

        best_pair, best_score = None, -1.0
        for pair in candidates:
            score = similarity(cleaned, pair[1]["title"])
            if score > best_score:
                best_pair, best_score = pair, score

        target_release = best_pair[0] if best_pair else releases[0]
        item = TaggingItem(
            release_id=target_release.id,
            source_path=path,
            original_filename=os.path.basename(path),
        )
        if best_pair is not None:
            _, track = best_pair
            item.suggested_track_title = track["title"]
            item.suggested_track_number = track["position"]
            item.suggested_disc_number = track["disc_number"]
            item.match_score = round(best_score, 3)
            candidates.remove(best_pair)
        db.add(item)
        created.append(item)

    db.commit()
    return created


def rescan_item(db: Session, item: TaggingItem) -> TaggingItem:
    """Recalcule la proposition de correspondance d'un item existant (ex: apres
    correction manuelle, ou pour sortir un item de status=error)."""
    release = item.release
    if not os.path.isfile(item.source_path):
        item.status = TaggingStatus.error
        item.error_message = "Fichier source introuvable (deplace ou supprime entre-temps)"
        db.commit()
        return item

    try:
        tracks = musicbrainz.get_release_tracks(release.musicbrainz_id)
    except Exception as exc:
        item.status = TaggingStatus.error
        item.error_message = f"MusicBrainz indisponible : {exc}"
        db.commit()
        return item

    cleaned = normalize_text(_clean_filename(item.original_filename))
    item.status = TaggingStatus.needs_review
    item.error_message = None
    if tracks:
        best_score, best_track = max(((similarity(cleaned, t["title"]), t) for t in tracks), key=lambda st: st[0])
        item.suggested_track_title = best_track["title"]
        item.suggested_track_number = best_track["position"]
        item.suggested_disc_number = best_track["disc_number"]
        item.match_score = round(best_score, 3)
    db.commit()
    return item


def get_tracklist_choices(release: Release) -> list[dict]:
    """Tracklist complete de la release, pour le selecteur manuel cote frontend."""
    try:
        return musicbrainz.get_release_tracks(release.musicbrainz_id)
    except Exception:
        logger.exception("Tracklist MusicBrainz indisponible pour %s - %s", release.artist.name, release.title)
        return []


def _write_tags(source_path: str, item: TaggingItem, track_title: str, track_number: int | None, disc_number: int | None) -> None:
    from mutagen.id3 import APIC, ID3, ID3NoHeaderError, TALB, TDRC, TIT2, TPE1, TPE2, TPOS, TRCK, TXXX

    release = item.release
    artist = release.artist

    try:
        tags = ID3(source_path)
    except ID3NoHeaderError:
        tags = ID3()

    tags.delall("TIT2")
    tags.add(TIT2(encoding=3, text=track_title))
    # Meme valeur exacte de release.title pour toutes les pistes d'un album : c'est
    # ce qui evite les doublons d'album dans Navidrome/Picard lies a des tags
    # incoherents entre pistes d'un meme album.
    tags.delall("TALB")
    tags.add(TALB(encoding=3, text=release.title))
    tags.delall("TPE1")
    tags.add(TPE1(encoding=3, text=artist.name))
    tags.delall("TPE2")
    tags.add(TPE2(encoding=3, text=artist.name))
    if track_number:
        tags.delall("TRCK")
        tags.add(TRCK(encoding=3, text=str(track_number)))
    if disc_number:
        tags.delall("TPOS")
        tags.add(TPOS(encoding=3, text=str(disc_number)))
    if release.release_date:
        tags.delall("TDRC")
        tags.add(TDRC(encoding=3, text=str(release.release_date.year)))

    tags.delall("TXXX:MusicBrainz Album Id")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Album Id", text=release.musicbrainz_id))
    tags.delall("TXXX:MusicBrainz Artist Id")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Artist Id", text=artist.musicbrainz_id))

    if release.cover_url:
        try:
            resp = httpx.get(release.cover_url, timeout=15)
            resp.raise_for_status()
            tags.delall("APIC")
            tags.add(APIC(encoding=3, mime=resp.headers.get("content-type", "image/jpeg"), type=3, desc="Cover", data=resp.content))
        except Exception:
            logger.warning("Impossible de recuperer la cover pour le tag APIC (%s)", release.cover_url)

    tags.save(source_path, v2_version=3)


def apply_tag_and_move(
    db: Session,
    settings: Settings,
    item: TaggingItem,
    track_title: str,
    track_number: int | None,
    disc_number: int | None,
) -> TaggingItem:
    """Ecrit les tags ID3 et deplace le fichier vers <bibliotheque>/<Artiste>/<Album>/
    - seule fonction de ce module qui ecrit sur le disque, appelee uniquement
    depuis une confirmation explicite de l'utilisateur (POST /api/tagging/{id}/confirm)."""
    release = item.release
    artist = release.artist

    if not os.path.isfile(item.source_path):
        item.status = TaggingStatus.error
        item.error_message = "Fichier source introuvable (deplace ou supprime entre-temps)"
        db.commit()
        return item

    ext = os.path.splitext(item.source_path)[1].lower()
    if ext != ".mp3":
        item.status = TaggingStatus.error
        item.error_message = f"Format non pris en charge pour le tagging automatique : {ext}"
        db.commit()
        return item

    target_dir = os.path.join(settings.tagging_library_path, sanitize_component(artist.name), sanitize_component(release.title))
    disc_prefix = f"{disc_number}-" if disc_number and disc_number > 1 else ""
    filename = f"{disc_prefix}{(track_number or 0):02d} - {sanitize_component(track_title)}.mp3"
    target_path = os.path.join(target_dir, filename)

    if os.path.exists(target_path):
        item.status = TaggingStatus.error
        item.error_message = f"Un fichier existe deja a la destination : {target_path}"
        db.commit()
        return item

    try:
        _write_tags(item.source_path, item, track_title, track_number, disc_number)
        os.makedirs(target_dir, exist_ok=True)
        shutil.move(item.source_path, target_path)
    except Exception as exc:
        logger.exception("Echec du tagging/deplacement pour %s", item.source_path)
        item.status = TaggingStatus.error
        item.error_message = str(exc)
        db.commit()
        return item

    item.status = TaggingStatus.done
    item.target_path = target_path
    item.error_message = None
    item.suggested_track_title = track_title
    item.suggested_track_number = track_number
    item.suggested_disc_number = disc_number
    db.commit()
    return item
