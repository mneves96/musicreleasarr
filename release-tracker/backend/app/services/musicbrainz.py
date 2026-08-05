"""Client MusicBrainz : source pivot pour identifier artistes et releases.

L'API MusicBrainz impose 1 requete/seconde et un User-Agent identifiant
l'application (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).
"""

import threading
import time
from datetime import date

import httpx

BASE_URL = "https://musicbrainz.org/ws/2"
USER_AGENT = "MusicReleasarr/1.0 ( self-hosted )"

_lock = threading.Lock()
_last_call = 0.0
_MIN_INTERVAL = 1.05


def _throttled_get(path: str, params: dict) -> dict:
    global _last_call
    with _lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        resp = httpx.get(
            f"{BASE_URL}{path}",
            params={**params, "fmt": "json"},
            headers={"User-Agent": USER_AGENT},
            timeout=15,
        )
        _last_call = time.monotonic()
    resp.raise_for_status()
    return resp.json()


# Valeurs possibles du champ "type" MusicBrainz pour un artiste (utilisees telles
# quelles dans la requete Lucene - pas d'espace, pas d'echappement necessaire).
ARTIST_TYPES = ["Person", "Group", "Orchestra", "Choir", "Character", "Other"]


def _build_search_query(name: str, country: str | None, artist_type: str | None, tag: str | None) -> str:
    """Construit la requete Lucene envoyee a /artist. Le nom reste un terme libre
    (pas de guillemets) pour laisser MusicBrainz matcher nom/alias/nom de tri au
    sens large - le mettre entre guillemets forcerait une phrase exacte et
    reduirait le rappel, l'inverse de ce qu'on cherche a ameliorer ici."""
    clauses = [name] if name else []
    if country:
        clauses.append(f"country:{country}")
    if artist_type:
        clauses.append(f"type:{artist_type}")
    if tag:
        escaped = tag.replace("\\", "\\\\").replace('"', '\\"')
        clauses.append(f'tag:"{escaped}"')
    return " AND ".join(clauses)


def search_artists(
    query: str,
    limit: int = 15,
    offset: int = 0,
    country: str | None = None,
    artist_type: str | None = None,
    tag: str | None = None,
) -> tuple[list[dict], int]:
    lucene_query = _build_search_query(query, country, artist_type, tag)
    data = _throttled_get("/artist", {"query": lucene_query, "limit": limit, "offset": offset})
    return data.get("artists", []), data.get("count", 0)


def get_artist(artist_mbid: str) -> dict:
    return _throttled_get(f"/artist/{artist_mbid}", {})


def extract_area(mb_artist: dict) -> tuple[str | None, str | None]:
    """Code pays ISO (ex: "GB") et nom de la zone (ex: "United Kingdom") pour la nationalite."""
    country = mb_artist.get("country")
    area_name = (mb_artist.get("area") or {}).get("name")
    return country, area_name


def get_release_groups(artist_mbid: str) -> list[dict]:
    """Toutes les release-groups (albums/EP/singles/compiles) d'un artiste, avec leur date de premiere sortie."""
    release_groups: list[dict] = []
    offset = 0
    limit = 100
    while True:
        data = _throttled_get(
            "/release-group",
            {"artist": artist_mbid, "limit": limit, "offset": offset},
        )
        batch = data.get("release-groups", [])
        release_groups.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return release_groups


def get_release_tracks(release_group_mbid: str, expected_track_count: int | None = None) -> list[dict]:
    """Tracklist canonique d'une release-group, utilisee comme source de verite
    pour le redressage des tags (voir services/tagging.py) - contrairement a
    ytmusic.get_release_details qui ne garde ni position ni disque, ici on va
    chercher les releases concretes de la release-group (inc=recordings) et on
    choisit celle qui correspond le mieux : statut "Official" en priorite, puis
    nombre de pistes le plus proche de expected_track_count (nombre de fichiers
    deja detectes dans le backlog) si fourni."""
    data = _throttled_get(
        "/release",
        {"release-group": release_group_mbid, "inc": "recordings", "limit": 25},
    )
    releases = data.get("releases", [])
    if not releases:
        return []

    def sort_key(release: dict) -> tuple:
        is_official = release.get("status") == "Official"
        track_count = sum(len(medium.get("tracks", [])) for medium in release.get("media", []))
        count_diff = abs(track_count - expected_track_count) if expected_track_count else 0
        return (not is_official, count_diff, -track_count)

    best = min(releases, key=sort_key)

    tracks: list[dict] = []
    for disc_idx, medium in enumerate(best.get("media", []), start=1):
        disc_number = medium.get("position") or disc_idx
        for track in medium.get("tracks", []):
            try:
                position = int(track.get("position") or track.get("number") or 0)
            except (TypeError, ValueError):
                position = 0
            tracks.append(
                {
                    "title": track.get("title", ""),
                    "position": position,
                    "disc_number": disc_number,
                    "recording_id": (track.get("recording") or {}).get("id"),
                }
            )
    return tracks


# Types qui polluent le suivi (bootlegs, radio broadcasts, demos, mixtapes...) :
# on ignore completement ces release-groups plutot que de les ranger dans "other".
_JUNK_SECONDARY_TYPES = {
    "live",
    "demo",
    "dj-mix",
    "mixtape/street",
    "interview",
    "audiobook",
    "audio drama",
    "spokenword",
    "field recording",
    "remix",
}


def classify_release_type(release_group: dict) -> str | None:
    """Renvoie le type de release (album/ep/single/compilation), ou None si la
    release-group doit etre ignoree (broadcast, live, demo, remix, etc.)."""
    primary = (release_group.get("primary-type") or "").lower()
    secondary = {s.lower() for s in release_group.get("secondary-types") or []}

    if secondary & _JUNK_SECONDARY_TYPES:
        return None
    if "compilation" in secondary:
        return "compilation"
    if primary == "album":
        return "album"
    if primary == "ep":
        return "ep"
    if primary == "single":
        return "single"
    return None


def parse_release_date(value: str | None) -> tuple[date | None, str | None]:
    """MusicBrainz renvoie des dates a precision variable : "YYYY", "YYYY-MM" ou "YYYY-MM-DD"."""
    if not value:
        return None, None
    parts = value.split("-")
    try:
        if len(parts) == 3:
            return date(int(parts[0]), int(parts[1]), int(parts[2])), "day"
        if len(parts) == 2:
            return date(int(parts[0]), int(parts[1]), 1), "month"
        if len(parts) == 1 and parts[0]:
            return date(int(parts[0]), 1, 1), "year"
    except ValueError:
        return None, None
    return None, None
