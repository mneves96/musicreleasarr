"""Client Cover Art Archive : pochette officielle rattachee directement au
release-group MusicBrainz (pas de matching flou necessaire, contrairement a
Deezer/Last.fm)."""

import httpx

BASE_URL = "https://coverartarchive.org"


def get_release_group_cover(mbid: str) -> str | None:
    """Verifie juste que la pochette existe (1 seul aller-retour, sans suivre la
    redirection jusqu'au CDN) : le navigateur suivra lui-meme la redirection au
    chargement de l'image, ce qui est bien plus rapide qu'un scan a plusieurs
    centaines de releases fait cote serveur. front-1200 (le plus grand format
    fixe propose par Cover Art Archive) plutot que front-500 : cette meme URL
    sert aussi a embarquer la pochette dans le tag APIC des fichiers audio
    (voir services/tagging.py), ou une miniature 500px degradait nettement le
    rendu sur les lecteurs/telephones."""
    url = f"{BASE_URL}/release-group/{mbid}/front-1200"
    try:
        resp = httpx.head(url, follow_redirects=False, timeout=10)
        if resp.status_code in (200, 301, 302, 307, 308):
            return url
    except httpx.HTTPError:
        pass
    return None
