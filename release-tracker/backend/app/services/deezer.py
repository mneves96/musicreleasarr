"""Client Deezer (API publique, sans cle) : utilise pour enrichir cover/lien."""

import httpx

from ..matching import best_match

BASE_URL = "https://api.deezer.com"

RECORD_TYPE_MAP = {
    "album": "album",
    "single": "single",
    "ep": "ep",
    "compile": "compilation",
}


def search_artist(name: str) -> dict | None:
    resp = httpx.get(f"{BASE_URL}/search/artist", params={"q": name}, timeout=10)
    resp.raise_for_status()
    results = resp.json().get("data", [])
    return results[0] if results else None


def get_artist_albums(deezer_artist_id: str) -> list[dict]:
    albums: list[dict] = []
    url = f"{BASE_URL}/artist/{deezer_artist_id}/albums"
    params = {"limit": 100}
    while url:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        albums.extend(data.get("data", []))
        url = data.get("next")
        params = None
    return albums


def find_matching_album(albums: list[dict], title: str) -> dict | None:
    titles = [a.get("title", "") for a in albums]
    idx = best_match(title, titles)
    return albums[idx] if idx is not None else None
