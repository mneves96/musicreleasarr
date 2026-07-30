"""Client MeTube : envoie une URL YouTube Music a telecharger.

MeTube expose un endpoint HTTP POST /add ({url, download_type, quality, format, folder}).
download_type est obligatoire depuis les versions recentes de MeTube (valeurs
possibles : video/audio/captions/thumbnail) - on veut "audio" pour de la musique.
CUSTOM_DIRS=true est deja active sur le conteneur metube existant, ce qui
permet de ranger le telechargement dans un sous-dossier par artiste.
"""

import httpx


def queue_download(metube_url: str, url: str, folder: str | None = None) -> tuple[bool, str]:
    payload = {"url": url, "download_type": "audio", "quality": "320", "format": "mp3"}
    if folder:
        payload["folder"] = folder

    try:
        resp = httpx.post(f"{metube_url.rstrip('/')}/add", json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "error":
            return False, data.get("msg", "MeTube a refuse le telechargement")
        return True, "Telechargement mis en file d'attente"
    except httpx.HTTPError as exc:
        return False, f"Impossible de joindre MeTube : {exc}"


def queue_release(
    metube_url: str, folder: str | None, playlist_url: str | None, track_video_ids: list[str]
) -> tuple[bool, str]:
    """Telecharge une release entiere : via son lien de playlist YouTube Music si
    disponible, sinon en repli piste par piste (certaines releases n'ont pas
    d'audioPlaylistId cote YouTube Music meme si leurs pistes existent bien)."""
    if playlist_url:
        return queue_download(metube_url, playlist_url, folder=folder)

    if not track_video_ids:
        return False, "Aucune piste trouvee pour cette release sur YouTube Music"

    failures = 0
    for video_id in track_video_ids:
        ok, _ = queue_download(metube_url, f"https://music.youtube.com/watch?v={video_id}", folder=folder)
        if not ok:
            failures += 1

    if failures == 0:
        return True, f"{len(track_video_ids)} piste(s) mise(s) en file d'attente"
    return False, f"{failures} piste(s) en echec sur {len(track_video_ids)}"
