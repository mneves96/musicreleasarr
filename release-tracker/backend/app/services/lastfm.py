"""Client Last.fm : utilise en fallback pour l'image et le lien de l'artiste
(lecture seule, cle API seule suffit - reutilisable depuis celle deja
configuree pour Navidrome), et pour les recommandations personnalisees, qui
necessitent en plus une connexion complete au compte Last.fm de
l'utilisateur (voir get_recommended_artists : reconstruites a partir de
user.getTopArtists + artist.getSimilar, Last.fm ayant retire la methode
dediee user.getRecommendedArtists de son API).

Le flux de connexion suit le schema "desktop application" de Last.fm (pas
besoin d'URL de callback publique, adapte a une app self-hosted derriere
n'importe quel reverse proxy) :
  1. auth.getToken (signe) -> jeton temporaire
  2. l'utilisateur autorise l'app sur last.fm/api/auth/?api_key=...&token=...
  3. auth.getSession (signe) -> cle de session permanente (jusqu'a revocation)
Voir routers/settings.py pour les endpoints qui orchestrent ce flux.
"""

import hashlib
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


def _sign(params: dict[str, str], secret: str) -> str:
    """Signature Last.fm : concatene cle+valeur de chaque parametre trie par
    cle, ajoute le secret, hash MD5 - voir
    https://www.last.fm/api/authspec#8 (les parametres 'format' et 'callback'
    ne rentrent jamais dans la signature, on les ajoute donc apres coup)."""
    base = "".join(f"{k}{v}" for k, v in sorted(params.items()))
    return hashlib.md5((base + secret).encode("utf-8")).hexdigest()


def _signed_get(params: dict[str, str], secret: str) -> dict:
    signed = {**params, "api_sig": _sign(params, secret), "format": "json"}
    resp = httpx.get(BASE_URL, params=signed, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(data.get("message") or f"Erreur Last.fm ({data['error']})")
    return data


def get_auth_token(api_key: str, api_secret: str) -> str:
    data = _signed_get({"method": "auth.getToken", "api_key": api_key}, api_secret)
    return data["token"]


def auth_url(api_key: str, token: str) -> str:
    return f"https://www.last.fm/api/auth/?api_key={api_key}&token={token}"


def get_session(api_key: str, api_secret: str, token: str) -> dict:
    """{"name": <utilisateur Last.fm>, "key": <cle de session permanente>, ...}"""
    data = _signed_get({"method": "auth.getSession", "api_key": api_key, "token": token}, api_secret)
    return data["session"]


def get_top_artists(api_key: str, api_secret: str, session_key: str, period: str = "overall", limit: int = 10) -> list[dict]:
    data = _signed_get(
        {"method": "user.getTopArtists", "api_key": api_key, "sk": session_key, "period": period, "limit": str(limit)},
        api_secret,
    )
    return data.get("topartists", {}).get("artist", [])


def get_similar_artists(name: str, api_key: str, limit: int = 15) -> list[dict]:
    """Publique (cle API seule, pas de session) - contrairement a
    user.getRecommendedArtists (voir get_recommended_artists)."""
    resp = httpx.get(
        BASE_URL,
        params={"method": "artist.getsimilar", "artist": name, "api_key": api_key, "limit": str(limit), "format": "json"},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get("similarartists", {}).get("artist", [])


def get_recommended_artists(api_key: str, api_secret: str, session_key: str, limit: int = 50) -> list[dict]:
    """Last.fm a retire user.getRecommendedArtists de son API (confirme par un
    400 Bad Request en production, methode authentifiee historiquement
    utilisee ici) - reconstruit une recommandation personnalisee equivalente a
    partir de ce qui fonctionne encore : les artistes les plus ecoutes de
    l'utilisateur (user.getTopArtists, authentifie) puis, pour chacun, ses
    artistes similaires (artist.getSimilar, public). Les scores de similarite
    sont cumules par artiste candidat (recommande par plusieurs artistes
    ecoutes = mieux classe), et les artistes deja dans le top de l'utilisateur
    sont exclus. Chaque entree a potentiellement un "mbid" vide (artiste peu
    connu - voir routers/artists.py qui retente une resolution MusicBrainz par
    nom dans ce cas)."""
    top_artists = get_top_artists(api_key, api_secret, session_key, limit=10)
    top_names_lower = {a["name"].lower() for a in top_artists if a.get("name")}

    aggregated: dict[str, dict] = {}
    for artist in top_artists:
        name = artist.get("name")
        if not name:
            continue
        try:
            similar = get_similar_artists(name, api_key, limit=15)
        except Exception:
            continue
        for candidate in similar:
            cand_name = candidate.get("name")
            if not cand_name or cand_name.lower() in top_names_lower:
                continue
            try:
                match_score = float(candidate.get("match") or 0)
            except (TypeError, ValueError):
                match_score = 0.0
            entry = aggregated.setdefault(
                cand_name.lower(),
                {"name": cand_name, "mbid": candidate.get("mbid"), "image": candidate.get("image"), "score": 0.0},
            )
            entry["score"] += match_score

    ranked = sorted(aggregated.values(), key=lambda e: e["score"], reverse=True)
    return ranked[:limit]
