"""Client Last.fm : utilise en fallback pour l'image et le lien de l'artiste.

Necessite seulement une cle API (lecture seule), reutilisable depuis celle
deja configuree pour Navidrome.
"""

import httpx

BASE_URL = "https://ws.audioscrobbler.com/2.0/"


def get_artist_info(name: str, api_key: str) -> dict | None:
    if not api_key:
        return None
    resp = httpx.get(
        BASE_URL,
        params={
            "method": "artist.getinfo",
            "artist": name,
            "api_key": api_key,
            "format": "json",
        },
        timeout=10,
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data.get("artist")


def best_image(artist_info: dict | None) -> str | None:
    if not artist_info:
        return None
    images = artist_info.get("image") or []
    for img in reversed(images):  # Last.fm liste les tailles du + petit au + grand
        url = img.get("#text")
        if url:
            return url
    return None


def artist_url(artist_info: dict | None) -> str | None:
    if not artist_info:
        return None
    return artist_info.get("url")
