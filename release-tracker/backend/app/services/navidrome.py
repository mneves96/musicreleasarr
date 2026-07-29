"""Client Subsonic pour interroger la bibliotheque Navidrome et savoir si une
release est deja possedee (pas d'acces disque direct, tout passe par l'API)."""

import hashlib
import secrets

import httpx

from ..matching import similarity

API_VERSION = "1.16.1"
CLIENT_NAME = "MusicReleasarr"

TITLE_THRESHOLD = 0.85
ARTIST_THRESHOLD = 0.8


def _auth_params(username: str, password: str) -> dict:
    salt = secrets.token_hex(6)
    token = hashlib.md5((password + salt).encode("utf-8")).hexdigest()
    return {
        "u": username,
        "t": token,
        "s": salt,
        "v": API_VERSION,
        "c": CLIENT_NAME,
        "f": "json",
    }


def ping(base_url: str, username: str, password: str) -> tuple[bool, str]:
    try:
        resp = httpx.get(
            f"{base_url.rstrip('/')}/rest/ping.view",
            params=_auth_params(username, password),
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json().get("subsonic-response", {})
        if body.get("status") == "ok":
            return True, "Connexion Navidrome OK"
        error = body.get("error", {}).get("message", "erreur inconnue")
        return False, f"Navidrome a repondu une erreur : {error}"
    except httpx.HTTPError as exc:
        return False, f"Impossible de joindre Navidrome : {exc}"


def album_exists(base_url: str, username: str, password: str, artist_name: str, album_title: str) -> bool:
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/search3.view",
        params={
            **_auth_params(username, password),
            "query": album_title,
            "albumCount": 20,
            "artistCount": 0,
            "songCount": 0,
        },
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    albums = body.get("searchResult3", {}).get("album", [])

    for album in albums:
        title_score = similarity(album_title, album.get("name", ""))
        artist_score = similarity(artist_name, album.get("artist", ""))
        if title_score >= TITLE_THRESHOLD and artist_score >= ARTIST_THRESHOLD:
            return True
    return False


def get_starred_artists(base_url: str, username: str, password: str) -> list[str]:
    """Noms des artistes marques favoris ("starred") dans Navidrome."""
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getStarred2.view",
        params=_auth_params(username, password),
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    artists = body.get("starred2", {}).get("artist", [])
    return [a["name"] for a in artists if a.get("name")]
