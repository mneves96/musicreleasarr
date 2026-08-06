"""Client Last.fm : utilise en fallback pour l'image et le lien de l'artiste
(lecture seule, cle API seule suffit - reutilisable depuis celle deja
configuree pour Navidrome), et pour les recommandations personnalisees, qui
necessitent en plus une connexion complete au compte Last.fm de
l'utilisateur (voir get_similar_to_followed : reconstruites a partir des
artistes suivis dans l'app + artist.getSimilar, plutot que de
user.getRecommendedArtists, retiree de l'API Last.fm, ou de
user.getTopArtists, qui reflete l'historique d'ecoute Last.fm - pas
forcement les artistes effectivement suivis dans musicreleasarr).

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


def get_similar_artists(name: str, api_key: str, limit: int = 15) -> list[dict]:
    """Publique (cle API seule, pas de session)."""
    resp = httpx.get(
        BASE_URL,
        params={"method": "artist.getsimilar", "artist": name, "api_key": api_key, "limit": str(limit), "format": "json"},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get("similarartists", {}).get("artist", [])


def get_similar_to_followed(followed: list[tuple[int, str]], api_key: str, limit: int = 50, per_artist_limit: int = 15) -> list[dict]:
    """Recommandations basees sur les artistes reellement suivis dans l'app
    (pas sur l'historique d'ecoute Last.fm, qui peut diverger) : pour chaque
    artiste suivi, recupere ses artistes similaires (artist.getSimilar,
    public) et agrege les scores par candidat (recommande par plusieurs
    artistes suivis = mieux classe). Chaque entree garde la trace des
    artistes suivis qui l'ont fait remonter (cle "sources", triee par
    contribution decroissante) pour affichage ("Base sur : ..." cote
    frontend, voir scheduler.refresh_lastfm_recommendations) et exclut tout
    candidat dont le nom correspond deja a un artiste suivi (en plus du
    controle par mbid fait cote appelant, qui reste la verification fiable -
    une simple comparaison de noms peut rater des variantes/alias). Chaque
    entree a potentiellement un "mbid" vide (artiste peu connu - voir
    scheduler.py qui retente une resolution MusicBrainz par nom dans ce
    cas)."""
    followed_names_lower = {name.lower() for _id, name in followed}

    aggregated: dict[str, dict] = {}
    for followed_id, name in followed:
        try:
            similar = get_similar_artists(name, api_key, limit=per_artist_limit)
        except Exception:
            continue
        for candidate in similar:
            cand_name = candidate.get("name")
            if not cand_name or cand_name.lower() in followed_names_lower:
                continue
            try:
                match_score = float(candidate.get("match") or 0)
            except (TypeError, ValueError):
                match_score = 0.0
            entry = aggregated.setdefault(
                cand_name.lower(),
                {
                    "name": cand_name,
                    "mbid": candidate.get("mbid"),
                    "image": candidate.get("image"),
                    "score": 0.0,
                    "sources": [],
                },
            )
            entry["score"] += match_score
            entry["sources"].append({"id": followed_id, "name": name, "score": match_score})

    ranked = sorted(aggregated.values(), key=lambda e: e["score"], reverse=True)
    for entry in ranked:
        entry["sources"].sort(key=lambda s: s["score"], reverse=True)
    return ranked[:limit]
