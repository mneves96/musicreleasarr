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


def search_artists(query: str, limit: int = 15) -> list[dict]:
    data = _throttled_get("/artist", {"query": query, "limit": limit})
    return data.get("artists", [])


def get_artist(artist_mbid: str) -> dict:
    return _throttled_get(f"/artist/{artist_mbid}", {})


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


def classify_release_type(release_group: dict) -> str:
    primary = (release_group.get("primary-type") or "").lower()
    secondary = [s.lower() for s in release_group.get("secondary-types") or []]

    if "compilation" in secondary:
        return "compilation"
    if primary == "album":
        return "album"
    if primary == "ep":
        return "ep"
    if primary == "single":
        return "single"
    return "other"


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
