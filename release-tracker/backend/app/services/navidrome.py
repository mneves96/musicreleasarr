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


def _find_matching_album(
    base_url: str, username: str, password: str, artist_name: str, album_title: str
) -> dict | None:
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
            return album
    return None


def album_exists(base_url: str, username: str, password: str, artist_name: str, album_title: str) -> bool:
    return _find_matching_album(base_url, username, password, artist_name, album_title) is not None


def get_owned_track_titles(
    base_url: str, username: str, password: str, artist_name: str, album_title: str
) -> list[str] | None:
    """Titres des pistes reellement presentes dans Navidrome pour l'album
    correspondant, pour comparer piste par piste (pas juste au niveau album).
    None si aucun album correspondant n'a ete trouve (a distinguer d'une liste
    vide, qui signifierait un album trouve mais sans pistes indexees)."""
    album = _find_matching_album(base_url, username, password, artist_name, album_title)
    if album is None:
        return None

    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getAlbum.view",
        params={**_auth_params(username, password), "id": album["id"]},
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    songs = body.get("album", {}).get("song", [])
    return [s.get("title", "") for s in songs if s.get("title")]


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


def get_library_stats(base_url: str, username: str, password: str) -> dict:
    """Nombre d'artistes/albums indexes - pas d'endpoint Subsonic dedie aux
    statistiques globales, on derive donc ces totaux de getArtists (ID3),
    dont chaque entree porte deja son nombre d'albums."""
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getArtists.view",
        params=_auth_params(username, password),
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    indexes = body.get("artists", {}).get("index", [])

    artist_count = 0
    album_count = 0
    for index in indexes:
        for artist in index.get("artist", []):
            artist_count += 1
            album_count += artist.get("albumCount") or 0

    return {"artist_count": artist_count, "album_count": album_count}


def get_scan_status(base_url: str, username: str, password: str) -> dict:
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getScanStatus.view",
        params=_auth_params(username, password),
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    status = body.get("scanStatus", {})
    return {"scanning": bool(status.get("scanning")), "count": status.get("count")}


def start_scan(base_url: str, username: str, password: str, full: bool = False) -> tuple[bool, str]:
    """Lance un scan de la bibliotheque. fullScan=true (extension Navidrome au-
    dela du Subsonic standard) force une reverification complete de chaque
    fichier plutot que les seuls ajouts/changements recents - c'est aussi ce
    qui fait disparaitre de la base les entrees dont le fichier n'existe plus
    sur le disque (pas d'endpoint Subsonic dedie a un "nettoyage" separe : un
    scan complet fait office de nettoyage des fichiers manquants, meme
    principe que les deux boutons "Scan"/"Full scan" de l'interface native de
    Navidrome)."""
    try:
        params = _auth_params(username, password)
        if full:
            params["fullScan"] = "true"
        resp = httpx.get(f"{base_url.rstrip('/')}/rest/startScan.view", params=params, timeout=15)
        resp.raise_for_status()
        body = resp.json().get("subsonic-response", {})
        if body.get("status") == "ok":
            return True, "Scan complet lance" if full else "Scan lance"
        error = body.get("error", {}).get("message", "erreur inconnue")
        return False, f"Navidrome a repondu une erreur : {error}"
    except httpx.HTTPError as exc:
        return False, f"Impossible de joindre Navidrome : {exc}"


def get_now_playing(base_url: str, username: str, password: str) -> list[dict]:
    """Sessions d'ecoute actuellement actives (tous utilisateurs Navidrome
    confondus) - endpoint Subsonic standard, expire automatiquement cote
    serveur Navidrome des qu'un lecteur arrete de reporter sa position."""
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getNowPlaying.view",
        params=_auth_params(username, password),
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    return body.get("nowPlaying", {}).get("entry", [])


def get_recently_played(base_url: str, username: str, password: str, size: int = 20) -> list[dict]:
    """Albums les plus recemment ecoutes (type=recent, extension standard de
    getAlbumList2) - le Subsonic API n'expose pas de journal d'ecoute piste
    par piste/session par session, ceci en est l'equivalent le plus proche
    documente et stable."""
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getAlbumList2.view",
        params={**_auth_params(username, password), "type": "recent", "size": str(size)},
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    return body.get("albumList2", {}).get("album", [])


def get_genres(base_url: str, username: str, password: str) -> list[dict]:
    """Genres connus de la bibliotheque avec leur nombre de morceaux/albums -
    endpoint Subsonic standard, agrege sur toute la bibliotheque (pas par
    utilisateur), utilise pour le widget "genres les plus representes" du
    tableau de bord."""
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getGenres.view",
        params=_auth_params(username, password),
        timeout=15,
    )
    resp.raise_for_status()
    body = resp.json().get("subsonic-response", {})
    return body.get("genres", {}).get("genre", [])


_SONG_COUNT_PAGE_SIZE = 500


def get_song_count(base_url: str, username: str, password: str) -> int:
    """Nombre total de morceaux indexes - pas d'endpoint Subsonic dedie (comme
    get_library_stats pour artistes/albums), derive ici en paginant
    getAlbumList2 (tri alphabetique, le plus stable page a page) et en
    sommant songCount par album plutot que de tout re-parcourir cote
    artiste/album (chaque album ne porte son songCount qu'a ce niveau)."""
    total = 0
    offset = 0
    while True:
        resp = httpx.get(
            f"{base_url.rstrip('/')}/rest/getAlbumList2.view",
            params={
                **_auth_params(username, password),
                "type": "alphabeticalByName",
                "size": str(_SONG_COUNT_PAGE_SIZE),
                "offset": str(offset),
            },
            timeout=15,
        )
        resp.raise_for_status()
        body = resp.json().get("subsonic-response", {})
        albums = body.get("albumList2", {}).get("album", [])
        total += sum(a.get("songCount") or 0 for a in albums)
        if len(albums) < _SONG_COUNT_PAGE_SIZE:
            break
        offset += _SONG_COUNT_PAGE_SIZE
    return total


def get_cover_art(base_url: str, username: str, password: str, cover_id: str) -> tuple[bytes, str]:
    """Image brute (bytes, content-type) d'une cover Navidrome - l'auth
    Subsonic est signee (salt+token), le frontend ne peut donc pas construire
    l'URL lui-meme ; ce backend sert de proxy (voir routers/navidrome.py)."""
    resp = httpx.get(
        f"{base_url.rstrip('/')}/rest/getCoverArt.view",
        params={**_auth_params(username, password), "id": cover_id},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("content-type", "image/jpeg")
