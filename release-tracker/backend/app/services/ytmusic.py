"""Client YouTube Music (via la librairie non-officielle ytmusicapi).

Utilise uniquement pour retrouver, pour une release deja identifiee par
MusicBrainz, le lien YouTube Music correspondant a passer a MeTube.
La recherche publique ne necessite pas d'authentification, mais cette API
n'est pas officielle et peut casser si Google modifie son frontend.
"""

import logging
from functools import lru_cache

from ytmusicapi import YTMusic

from ..matching import best_match, similarity

logger = logging.getLogger("dedieufy.ytmusic")


@lru_cache(maxsize=1)
def _client() -> YTMusic:
    return YTMusic()


@lru_cache(maxsize=256)
def get_artist_catalog(artist_browse_id: str) -> tuple[tuple[str, str], ...]:
    """Discographie officielle (albums + singles, l'EP/compilation restant range
    dans "albums" cote YouTube Music) telle que YT Music l'associe lui-meme a cet
    artiste. Beaucoup plus fiable qu'une recherche texte generique : pas de risque
    de confusion avec un autre artiste au nom proche. Mis en cache pour le process
    (la discographie ne change pas assez souvent pour justifier de la refetch a
    chaque release resolue). Retourne des tuples (title, browseId) - un tuple est
    hashable, necessaire pour le cache lru."""
    yt = _client()
    try:
        artist = yt.get_artist(artist_browse_id)
    except Exception:
        logger.warning("Impossible de recuperer la discographie YT Music pour %s", artist_browse_id)
        return ()

    catalog: list[tuple[str, str]] = []
    for section_key in ("albums", "singles"):
        section = artist.get(section_key) or {}
        results = list(section.get("results") or [])

        section_browse_id, params = section.get("browseId"), section.get("params")
        if section_browse_id and params:
            try:
                results = yt.get_artist_albums(section_browse_id, params) or results
            except Exception:
                logger.warning("Pagination discographie YT Music echouee pour %s/%s", artist_browse_id, section_key)

        for item in results:
            browse_id, title = item.get("browseId"), item.get("title")
            if browse_id and title:
                catalog.append((title, browse_id))

    return tuple(catalog)


def match_in_catalog(release_title: str, catalog: tuple[tuple[str, str], ...], threshold: float = 0.6) -> str | None:
    if not catalog:
        return None
    idx = best_match(release_title, [title for title, _ in catalog], threshold=threshold)
    return catalog[idx][1] if idx is not None else None


def search_release_browse_id(artist_name: str, release_title: str, threshold: float = 0.55) -> str | None:
    """Recherche texte generique (repli si l'artiste n'a pas de discographie YT
    Music connue, voir resolve_release_browse_id). Le titre pese beaucoup plus que
    le nom d'artiste dans le score : les variations de formatage du nom d'artiste
    (feat., "The", accents, ordre "A & B" vs "A, B"...) faisaient rater trop de
    correspondances sinon."""
    yt = _client()
    results = yt.search(f"{artist_name} {release_title}", filter="albums", limit=20)

    best_id, best_score = None, 0.0
    for item in results:
        title = item.get("title", "")
        artists = " ".join(a.get("name", "") for a in item.get("artists") or [])
        title_score = similarity(release_title, title)
        artist_score = similarity(artist_name, artists)
        # Un titre tres proche suffit seul (compilations "Various Artists", featurings...) ;
        # sinon on exige un minimum de correspondance sur l'artiste pour eviter les faux positifs.
        score = title_score if title_score >= 0.92 else title_score * 0.8 + artist_score * 0.2
        if score > best_score:
            best_score, best_id = score, item.get("browseId")

    return best_id if best_score >= threshold else None


def search_song_album_browse_id(artist_name: str, release_title: str, threshold: float = 0.75) -> str | None:
    """Dernier repli : la plupart des singles sont mal indexes cote recherche
    "albums" de YouTube Music (voir resolve_release_browse_id) mais tres bien
    indexes cote "chansons". On cherche le morceau correspondant et on renvoie
    l'album/single auquel YT Music l'a rattache - parfois l'album parent plutot
    que le single original si la chanson y a aussi ete incluse, mais ca reste le
    meme enregistrement studio, donc un telechargement correct."""
    yt = _client()
    results = yt.search(f"{artist_name} {release_title}", filter="songs", limit=10)

    best_album_id, best_score = None, 0.0
    for item in results:
        album = item.get("album") or {}
        album_id = album.get("id")
        if not album_id:
            continue
        title = item.get("title", "")
        artists = " ".join(a.get("name", "") for a in item.get("artists") or [])
        title_score = similarity(release_title, title)
        artist_score = similarity(artist_name, artists)
        score = title_score if title_score >= 0.92 else title_score * 0.8 + artist_score * 0.2
        if score > best_score:
            best_score, best_album_id = score, album_id

    return best_album_id if best_score >= threshold else None


def resolve_release_browse_id(
    artist_name: str, release_title: str, artist_ytmusic_browse_id: str | None = None
) -> str | None:
    """Strategie en 3 temps, du plus fiable au plus permissif :
    1. Discographie connue de l'artiste (aucune ambiguite possible).
    2. Recherche texte generique filtree "albums".
    3. Recherche texte filtree "chansons" -> album auquel le morceau est rattache
       (les singles sont souvent mal trouves en (2) mais bien trouves ainsi)."""
    if artist_ytmusic_browse_id:
        catalog = get_artist_catalog(artist_ytmusic_browse_id)
        browse_id = match_in_catalog(release_title, catalog)
        if browse_id:
            return browse_id

    browse_id = search_release_browse_id(artist_name, release_title)
    if browse_id:
        return browse_id

    return search_song_album_browse_id(artist_name, release_title)


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
