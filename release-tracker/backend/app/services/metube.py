"""Client MeTube : envoie une URL YouTube Music a telecharger et suit son etat.

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


def get_history(metube_url: str) -> dict:
    """{"done": [...], "queue": [...], "pending": [...]} - chaque entree a un champ
    "url", "status" (pending/preparing/downloading/finished/error/scheduled),
    "percent" et "msg"/"error". Utilise pour suivre l'avancement reel d'un
    telechargement declenche via queue_download (MeTube telecharge en arriere-plan,
    /add ne fait qu'accepter la demande)."""
    resp = httpx.get(f"{metube_url.rstrip('/')}/history", timeout=15)
    resp.raise_for_status()
    return resp.json()
