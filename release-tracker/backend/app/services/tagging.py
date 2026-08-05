"""Pipeline "redressage metadata + rangement" post-telechargement, façon Picard.

Comme Picard, scan_downloads_root() parcourt l'integralite du dossier de
telechargements - pas seulement les artistes suivis par l'app - et cree une
entree de backlog pour chaque fichier audio trouve. Un dossier dont le nom
correspond a un artiste suivi (voir services/metube.py : MeTube range par
ARTISTE, folder=normalize_text(artist.name), pas par release) est directement
rapproche de ses releases pas encore "owned" ; les autres fichiers restent
"non identifies" (release_id=None) jusqu'a une recherche MusicBrainz manuelle
(identify_folder(), l'equivalent du "Lookup" de Picard sur un cluster).

Volontairement, aucune fonction ici n'ecrit de tag ni ne deplace de fichier
sans qu'un TaggingItem soit explicitement confirme via l'API (routers/tagging.py) :
un retour d'experience utilisateur indique qu'un tagging 100% automatique
produisait des doublons d'album (tags incoherents entre pistes d'un meme
album). scan_downloads_root()/identify_folder()/rescan_item() ne font donc que
proposer une correspondance ; seul apply_tag_and_move() ecrit sur le disque, et
uniquement a la demande explicite de l'utilisateur.
"""

import logging
import os
import re
import shutil
from datetime import date

import httpx
from sqlalchemy.orm import Session

from ..matching import normalize_text, similarity
from ..models import Artist, OwnershipStatus, Release, Settings, TaggingItem, TaggingStatus
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

Candidate = tuple[Release, dict]


def _clean_filename(filename: str) -> str:
    stem = os.path.splitext(filename)[0]
    stem = _NOISE_RE.sub("", stem)
    stem = _TOPIC_SUFFIX_RE.sub("", stem)
    return stem.strip()


#  Cle synthetique pour les fichiers deposes directement a la racine du dossier
#  de telechargements, sans aucun sous-dossier (ex: ajoutes manuellement plutot
#  que via MeTube, qui cree toujours un dossier par artiste) - "" ne peut jamais
#  correspondre au nom normalise d'un artiste reel.
LOOSE_FILES_FOLDER = ""


def _iter_audio_files_by_top_folder(root: str) -> dict[str, list[str]]:
    """Regroupe tous les fichiers audio sous `root` par dossier de PREMIER niveau,
    quelle que soit la profondeur reelle (root/Artiste/piste.mp3 et
    root/Artiste/Album/piste.mp3 sont tous deux rattaches au groupe "Artiste") -
    MeTube ne cree qu'un seul niveau de dossier par artiste, mais un rangement
    manuel plus profond (ex: Artiste/Album/) doit rester detecte integralement.
    Les fichiers deposes directement a la racine (sans sous-dossier) sont
    regroupes sous LOOSE_FILES_FOLDER plutot qu'ignores."""
    grouped: dict[str, list[str]] = {}
    loose_files: list[str] = []
    for entry in sorted(os.listdir(root)):
        top_path = os.path.join(root, entry)
        if os.path.isdir(top_path):
            files: list[str] = []
            for dirpath, _dirnames, filenames in os.walk(top_path):
                for filename in filenames:
                    if os.path.splitext(filename)[1].lower() in AUDIO_EXTENSIONS:
                        files.append(os.path.join(dirpath, filename))
            if files:
                grouped[entry] = sorted(files)
        elif os.path.splitext(entry)[1].lower() in AUDIO_EXTENSIONS:
            loose_files.append(top_path)
    if loose_files:
        grouped[LOOSE_FILES_FOLDER] = sorted(loose_files)
    return grouped


def sanitize_component(name: str) -> str:
    cleaned = _INVALID_FS_CHARS_RE.sub("", name).strip(" .")
    return cleaned or "Inconnu"


def _candidates_for_releases(releases: list[Release], expected_track_count: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    for release in releases:
        try:
            tracks = musicbrainz.get_release_tracks(release.musicbrainz_id, expected_track_count=expected_track_count)
        except Exception:
            logger.exception("Tracklist MusicBrainz indisponible pour %s", release.title)
            continue
        candidates.extend((release, track) for track in tracks)
    return candidates


def _greedy_match(
    labeled: list[tuple[str, str]], candidates: list[Candidate]
) -> dict[str, tuple[Candidate, float]]:
    """Associe chaque (cle, libelle nettoye) au meilleur candidat (release,
    piste) restant parmi `candidates`, en le retirant a chaque etape - une
    piste ne peut etre proposee qu'a une seule cle a la fois."""
    remaining = list(candidates)
    result: dict[str, tuple[Candidate, float]] = {}
    for key, label in labeled:
        best_pair, best_score = None, -1.0
        for pair in remaining:
            score = similarity(label, pair[1]["title"])
            if score > best_score:
                best_pair, best_score = pair, score
        if best_pair is not None:
            result[key] = (best_pair, best_score)
            remaining.remove(best_pair)
    return result


def scan_downloads_root(db: Session, settings: Settings) -> list[TaggingItem]:
    """Detecte tout fichier audio present (ou reapparu au meme chemin apres
    avoir deja ete traite) sous le dossier de telechargements, aussi
    profondement imbrique soit-il, groupe par dossier de premier niveau -
    comme Picard qui prend tout ce qu'il trouve, sans condition sur l'origine
    du telechargement ni sur le statut d'une release cote app.

    Purement base sur le systeme de fichiers : AUCUN appel reseau ici. Tenter
    de rapprocher chaque dossier de la tracklist MusicBrainz de toutes les
    releases manquantes de tous les artistes suivis, a chaque scan (toutes les
    5 min), etait lent (MusicBrainz limite a 1 requete/seconde) et fragile (un
    503 ponctuel de MusicBrainz laissait des dossiers entiers sans proposition,
    sans que la simple detection des fichiers en souffre pour autant). La
    correspondance devient une action explicite et ciblee - voir
    auto_match_folder() - a la demande de l'utilisateur, comme le bouton
    "Lookup" de Picard plutot qu'un scan automatique en arriere-plan.

    Log en detail ce qu'il trouve, pour diagnostiquer directement depuis les
    logs sans avoir a deviner."""
    root = settings.tagging_downloads_path
    logger.info("Scan du dossier de telechargements : %r", root)
    if not root or not os.path.isdir(root):
        logger.warning("Dossier de telechargements introuvable ou non configure (Reglages) : %r", root)
        return []

    try:
        files_by_folder = _iter_audio_files_by_top_folder(root)
    except OSError:
        logger.exception("Impossible de lister %s", root)
        return []

    total_on_disk = sum(len(files) for files in files_by_folder.values())
    logger.info(
        "Fichiers audio trouves sur le disque : %d, repartis sur %d dossier(s) : %s",
        total_on_disk,
        len(files_by_folder),
        {(name or "<racine>"): len(files) for name, files in files_by_folder.items()},
    )
    if not files_by_folder:
        return []

    existing_by_path = {item.source_path: item for item in db.query(TaggingItem).all()}

    created: list[TaggingItem] = []
    for folder_name, all_files in files_by_folder.items():
        # Un fichier deja "done" (deplace puis reapparu au meme chemin - ex:
        # retelecharge) est retraite depuis zero plutot qu'ignore a jamais : sa
        # ligne existante est reutilisee (source_path est unique en base).
        to_process = [p for p in all_files if existing_by_path.get(p) is None or existing_by_path[p].status == TaggingStatus.done]
        skipped = len(all_files) - len(to_process)
        logger.info(
            "Dossier %r : %d fichier(s) sur disque, %d a (re)detecter, %d deja en attente ignore(s)",
            folder_name or "<racine>", len(all_files), len(to_process), skipped,
        )
        for path in to_process:
            existing = existing_by_path.get(path)
            item = existing if existing is not None else TaggingItem(source_path=path)
            item.original_filename = os.path.basename(path)
            item.source_folder = folder_name
            item.status = TaggingStatus.needs_review
            item.error_message = None
            item.target_path = None
            item.release_id = None
            item.suggested_track_title = None
            item.suggested_track_number = None
            item.suggested_disc_number = None
            item.match_score = None
            if existing is None:
                db.add(item)
            created.append(item)

    db.commit()
    logger.info("Scan termine : %d fichier(s) nouveau(x) ou remis en attente sur %d trouve(s) sur le disque", len(created), total_on_disk)
    return created


def auto_match_folder(db: Session, source_folder: str) -> list[TaggingItem]:
    """Tentative de correspondance automatique nom-de-dossier <-> artiste
    suivi, declenchee explicitement (bouton "Detecter" cote frontend) plutot
    que par le scan periodique - voir scan_downloads_root pour le pourquoi.
    Ne renvoie que les fichiers effectivement matches (les autres restent
    "non identifies", a traiter via identify_folder si besoin)."""
    items = (
        db.query(TaggingItem)
        .filter(
            TaggingItem.release_id.is_(None),
            TaggingItem.source_folder == source_folder,
            TaggingItem.status == TaggingStatus.needs_review,
        )
        .all()
    )
    if not items:
        return []

    followed_artists = db.query(Artist).filter(Artist.is_followed.is_(True)).all()
    artist = next((a for a in followed_artists if normalize_text(a.name) == source_folder), None)
    if artist is None:
        return []

    releases = (
        db.query(Release)
        .filter(Release.artist_id == artist.id, Release.ownership_status != OwnershipStatus.owned)
        .all()
    )
    if not releases:
        return []

    candidates = _candidates_for_releases(releases, len(items))
    if not candidates:
        return []
    labeled = [(str(item.id), normalize_text(_clean_filename(item.original_filename))) for item in items]
    matches = _greedy_match(labeled, candidates)

    matched_items: list[TaggingItem] = []
    for item in items:
        match = matches.get(str(item.id))
        if match is None:
            continue
        (matched_release, track), score = match
        item.release_id = matched_release.id
        item.suggested_track_title = track["title"]
        item.suggested_track_number = track["position"]
        item.suggested_disc_number = track["disc_number"]
        item.match_score = round(score, 3)
        matched_items.append(item)

    db.commit()
    return matched_items


def search_release_groups(artist_musicbrainz_id: str) -> list[dict]:
    """Albums/EP/singles/compilations d'un artiste MusicBrainz, pour le
    selecteur d'identification manuelle (POST /api/tagging/identify) - meme
    filtrage que la decouverte automatique (scheduler._discover_for_artist).
    MusicBrainz est parfois temporairement indisponible (503) : plutot qu'un
    500 brut qui casse tout le panneau d'identification, on renvoie une liste
    vide et le frontend affiche "aucune release trouvee"."""
    try:
        release_groups = musicbrainz.get_release_groups(artist_musicbrainz_id)
    except Exception:
        logger.exception("MusicBrainz indisponible pour lister les releases de %s", artist_musicbrainz_id)
        return []
    items = []
    for rg in release_groups:
        release_type = musicbrainz.classify_release_type(rg)
        if release_type is None:
            continue
        release_date, _precision = musicbrainz.parse_release_date(rg.get("first-release-date"))
        items.append(
            {
                "musicbrainz_id": rg["id"],
                "title": rg["title"],
                "release_type": release_type,
                "release_date": release_date,
            }
        )
    items.sort(key=lambda r: r["release_date"] or date.min, reverse=True)
    return items


def identify_folder(db: Session, source_folder: str, release: Release) -> list[TaggingItem]:
    """Rattache les fichiers "non identifies" d'un dossier a la release choisie
    manuellement (recherche + selection MusicBrainz, l'equivalent du "Lookup"
    de Picard sur un cluster), et propose une correspondance piste par piste.
    Filtre sur la colonne source_folder stockee (correspondance exacte), pas sur
    un prefixe de chemin - gere nativement le cas des fichiers "en vrac"
    (LOOSE_FILES_FOLDER = "") sans risquer de capturer des fichiers d'un autre
    dossier plus profond par erreur."""
    items = (
        db.query(TaggingItem)
        .filter(TaggingItem.release_id.is_(None), TaggingItem.source_folder == source_folder)
        .all()
    )
    if not items:
        return []

    candidates = _candidates_for_releases([release], len(items))
    labeled = [(str(item.id), normalize_text(_clean_filename(item.original_filename))) for item in items]
    matches = _greedy_match(labeled, candidates) if candidates else {}

    for item in items:
        item.release_id = release.id
        match = matches.get(str(item.id))
        if match is not None:
            (_matched_release, track), score = match
            item.suggested_track_title = track["title"]
            item.suggested_track_number = track["position"]
            item.suggested_disc_number = track["disc_number"]
            item.match_score = round(score, 3)

    db.commit()
    return items


def rescan_item(db: Session, item: TaggingItem) -> TaggingItem:
    """Recalcule la proposition de correspondance d'un item deja identifie (ex:
    apres correction manuelle, ou pour sortir un item de status=error)."""
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


def _fetch_lyrics(artist_name: str, track_title: str, album_title: str) -> tuple[str | None, str | None]:
    """(paroles brutes, paroles synchronisees au format LRC) via lrclib.net -
    gratuit, sans cle API a configurer. Best effort : indisponibilite ou
    absence de resultat n'empeche jamais le tagging."""
    try:
        resp = httpx.get(
            "https://lrclib.net/api/get",
            params={"artist_name": artist_name, "track_name": track_title, "album_name": album_title},
            timeout=10,
            headers={"User-Agent": "MusicReleasarr/1.0 ( self-hosted )"},
        )
        if resp.status_code == 404:
            return None, None
        resp.raise_for_status()
        data = resp.json()
        return data.get("plainLyrics") or None, data.get("syncedLyrics") or None
    except Exception:
        logger.warning("Paroles indisponibles (lrclib) pour %s - %s", artist_name, track_title)
        return None, None


_LRC_TAG_RE = re.compile(r"\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]")


def _parse_lrc(lrc: str) -> list[tuple[str, int]]:
    """Convertit un texte LRC ("[01:02.34]parole") en liste (parole, ms) pour
    le tag ID3 SYLT - une ligne peut porter plusieurs timestamps (reprises)."""
    entries: list[tuple[str, int]] = []
    for line in lrc.splitlines():
        timestamps = list(_LRC_TAG_RE.finditer(line))
        if not timestamps:
            continue
        text = _LRC_TAG_RE.sub("", line).strip()
        for m in timestamps:
            minutes, seconds, frac = m.group(1), m.group(2), (m.group(3) or "0")
            millis = int((frac + "00")[:3])
            entries.append((text, int(minutes) * 60000 + int(seconds) * 1000 + millis))
    entries.sort(key=lambda e: e[1])
    return entries


def _write_tags(
    source_path: str,
    item: TaggingItem,
    track_title: str,
    track_number: int | None,
    disc_number: int | None,
    recording_id: str | None,
    plain_lyrics: str | None,
    synced_lyrics: str | None,
) -> None:
    from mutagen.id3 import APIC, ID3, ID3NoHeaderError, SYLT, TALB, TDRC, TIT2, TPE1, TPE2, TPOS, TRCK, TXXX, UFID, USLT

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

    # Identifiants MusicBrainz complets (comme Picard) : facilite le matching cote
    # Navidrome/autres lecteurs et evite les doublons d'album lies a des tags
    # incoherents entre pistes.
    tags.delall("TXXX:MusicBrainz Album Id")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Album Id", text=release.musicbrainz_id))
    tags.delall("TXXX:MusicBrainz Release Group Id")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Release Group Id", text=release.musicbrainz_id))
    tags.delall("TXXX:MusicBrainz Artist Id")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Artist Id", text=artist.musicbrainz_id))
    tags.delall("TXXX:MusicBrainz Album Artist Id")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Album Artist Id", text=artist.musicbrainz_id))
    tags.delall("TXXX:MusicBrainz Album Type")
    tags.add(TXXX(encoding=3, desc="MusicBrainz Album Type", text=release.release_type.value))
    if recording_id:
        tags.delall("UFID:http://musicbrainz.org")
        tags.add(UFID(owner="http://musicbrainz.org", data=recording_id.encode("ascii")))

    if release.cover_url:
        try:
            resp = httpx.get(release.cover_url, timeout=15)
            resp.raise_for_status()
            tags.delall("APIC")
            tags.add(APIC(encoding=3, mime=resp.headers.get("content-type", "image/jpeg"), type=3, desc="Cover", data=resp.content))
        except Exception:
            logger.warning("Impossible de recuperer la cover pour le tag APIC (%s)", release.cover_url)

    # lang="und" (indetermine, ISO 639-2) plutot que de supposer "eng" - la
    # bibliotheque peut tres bien contenir des artistes non anglophones.
    if plain_lyrics:
        tags.delall("USLT")
        tags.add(USLT(encoding=3, lang="und", desc="", text=plain_lyrics))
    if synced_lyrics:
        entries = _parse_lrc(synced_lyrics)
        if entries:
            # format=2 (millisecondes), type=1 (paroles) : c'est ce qui permet
            # aux lecteurs qui savent lire SYLT de faire defiler les paroles en
            # rythme avec la musique, plutot qu'un simple bloc de texte statique.
            tags.delall("SYLT")
            tags.add(SYLT(encoding=3, lang="und", format=2, type=1, desc="", text=entries))

    tags.save(source_path, v2_version=3)


def _cleanup_empty_dirs(path: str, stop_at: str) -> None:
    """Supprime `path` et ses dossiers parents devenus vides, en remontant
    jusqu'a (sans le supprimer) `stop_at` - evite de laisser une arborescence
    de dossiers vides dans le dossier de telechargements une fois toutes ses
    pistes deplacees vers la bibliotheque. Best effort : n'importe quelle
    erreur (permissions, dossier deja recree entre-temps...) arrete juste le
    nettoyage sans faire echouer la confirmation."""
    stop_at = os.path.normpath(stop_at)
    current = os.path.normpath(path)
    while current != stop_at and current.startswith(stop_at + os.sep):
        try:
            if os.listdir(current):
                break
            os.rmdir(current)
        except OSError:
            break
        current = os.path.dirname(current)


def apply_tag_and_move(
    db: Session,
    settings: Settings,
    item: TaggingItem,
    track_title: str,
    track_number: int | None,
    disc_number: int | None,
    recording_id: str | None = None,
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

    plain_lyrics, synced_lyrics = _fetch_lyrics(artist.name, track_title, release.title)

    source_dir = os.path.dirname(item.source_path)
    try:
        _write_tags(item.source_path, item, track_title, track_number, disc_number, recording_id, plain_lyrics, synced_lyrics)
        os.makedirs(target_dir, exist_ok=True)
        shutil.move(item.source_path, target_path)
    except Exception as exc:
        logger.exception("Echec du tagging/deplacement pour %s", item.source_path)
        item.status = TaggingStatus.error
        item.error_message = str(exc)
        db.commit()
        return item

    if synced_lyrics:
        # Fichier .lrc a cote de la piste : c'est ce que Navidrome (et la
        # plupart des lecteurs modernes) lit en priorite pour le defilement
        # synchronise, le support de SYLT embarque etant tres inegal cote lecteurs.
        lrc_path = os.path.splitext(target_path)[0] + ".lrc"
        try:
            with open(lrc_path, "w", encoding="utf-8") as f:
                f.write(synced_lyrics)
        except OSError:
            logger.warning("Impossible d'ecrire le fichier .lrc pour %s", target_path)

    _cleanup_empty_dirs(source_dir, settings.tagging_downloads_path)

    item.status = TaggingStatus.done
    item.target_path = target_path
    item.error_message = None
    item.suggested_track_title = track_title
    item.suggested_track_number = track_number
    item.suggested_disc_number = disc_number
    db.commit()
    return item
