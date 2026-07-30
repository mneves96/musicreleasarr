"""Client YouTube Music (via la librairie non-officielle ytmusicapi).

Utilise uniquement pour retrouver, pour une release deja identifiee par
MusicBrainz, le lien YouTube Music correspondant a passer a MeTube.
La recherche publique ne necessite pas d'authentification, mais cette API
n'est pas officielle et peut casser si Google modifie son frontend.
"""

from functools import lru_cache

from ytmusicapi import YTMusic

from ..matching import similarity


@lru_cache(maxsize=1)
def _client() -> YTMusic:
    return YTMusic()


def search_release_browse_id(artist_name: str, release_title: str, threshold: float = 0.6) -> str | None:
    yt = _client()
    results = yt.search(f"{artist_name} {release_title}", filter="albums", limit=10)

    best_id, best_score = None, 0.0
    for item in results:
        title = item.get("title", "")
        artists = " ".join(a.get("name", "") for a in item.get("artists") or [])
        score = similarity(release_title, title) * 0.7 + similarity(artist_name, artists) * 0.3
        if score > best_score:
            best_score, best_id = score, item.get("browseId")

    return best_id if best_score >= threshold else None


def album_url(browse_id: str) -> str:
    """Lien "page album" YouTube Music (ex: https://music.youtube.com/browse/MPREb_xxx).

    C'est ce lien-la (pas un lien de playlist "audioPlaylistId", qui n'existe pas
    pour toutes les releases) qui, teste manuellement dans MeTube, telecharge
    l'album complet en evitant la plupart des clips/versions live : yt-dlp sait
    nativement l'extraire comme une playlist complete."""
    return f"https://music.youtube.com/browse/{browse_id}"


def get_release_details(browse_id: str) -> dict:
    """Utilise pour lister les pistes (ecran artiste, telechargement manuel piste
    par piste) - pas necessaire pour le telechargement de l'album complet, qui se
    fait directement via album_url()."""
    yt = _client()
    album = yt.get_album(browse_id)
    tracks = [
        {
            "title": t.get("title"),
            "video_id": t.get("videoId"),
            "duration": t.get("duration"),
        }
        for t in album.get("tracks", [])
        if t.get("videoId")
    ]
    return {"album_url": album_url(browse_id), "tracks": tracks}


def search_artist_browse_id(name: str, threshold: float = 0.8) -> str | None:
    yt = _client()
    results = yt.search(name, filter="artists", limit=5)
    for item in results:
        if similarity(name, item.get("artist", "")) >= threshold:
            return item.get("browseId")
    return None
