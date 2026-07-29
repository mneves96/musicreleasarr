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


def get_release_details(browse_id: str) -> dict:
    yt = _client()
    album = yt.get_album(browse_id)
    playlist_id = album.get("audioPlaylistId")
    tracks = [
        {
            "title": t.get("title"),
            "video_id": t.get("videoId"),
            "duration": t.get("duration"),
        }
        for t in album.get("tracks", [])
        if t.get("videoId")
    ]
    playlist_url = (
        f"https://music.youtube.com/playlist?list={playlist_id}" if playlist_id else None
    )
    return {"playlist_url": playlist_url, "tracks": tracks}


def search_artist_browse_id(name: str, threshold: float = 0.8) -> str | None:
    yt = _client()
    results = yt.search(name, filter="artists", limit=5)
    for item in results:
        if similarity(name, item.get("artist", "")) >= threshold:
            return item.get("browseId")
    return None
