"""Client Cover Art Archive : pochette officielle rattachee directement au
release-group MusicBrainz (pas de matching flou necessaire, contrairement a
Deezer/Last.fm)."""

import httpx

BASE_URL = "https://coverartarchive.org"


def get_release_group_cover(mbid: str) -> str | None:
    """Verifie juste que la pochette existe (1 seul aller-retour, sans suivre la
    redirection jusqu'au CDN) : le navigateur suivra lui-meme la redirection au
    chargement de l'image, ce qui est bien plus rapide qu'un scan a plusieurs
    centaines de releases fait cote serveur."""
    url = f"{BASE_URL}/release-group/{mbid}/front-500"
    try:
        resp = httpx.head(url, follow_redirects=False, timeout=10)
        if resp.status_code in (200, 301, 302, 307, 308):
            return url
    except httpx.HTTPError:
        pass
    return None
