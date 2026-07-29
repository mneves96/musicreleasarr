"""Client Last.fm : utilise en fallback pour l'image et le lien de l'artiste.

Necessite seulement une cle API (lecture seule), reutilisable depuis celle
deja configuree pour Navidrome.
"""

import re

import httpx

BASE_URL = "https://ws.audioscrobbler.com/2.0/"
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


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


def bio_summary(artist_info: dict | None, max_len: int = 500) -> str | None:
    if not artist_info:
        return None
    bio = artist_info.get("bio") or {}
    summary = bio.get("summary") or bio.get("content")
    if not summary:
        return None
    # Le resume Last.fm inclut souvent un lien "Read more on Last.fm" en HTML.
    text = _WS_RE.sub(" ", _TAG_RE.sub("", summary)).strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len].rsplit(" ", 1)[0] + "..."
    return text
