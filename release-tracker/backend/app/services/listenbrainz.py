"""Client ListenBrainz : source de recommandation basee sur l'ecoute reelle de
l'utilisateur (scrobbles), contrairement a Last.fm/MusicBrainz dans ce projet
qui partent toutes deux des artistes suivis dans l'app. Navidrome sait deja
scrobbler nativement vers ListenBrainz - voir scheduler.refresh_listenbrainz_recommendations.

Tout est public en lecture sur listenbrainz.org (stats, recommandations) tant
que le profil de l'utilisateur n'est pas explicitement passe en prive : aucun
token n'est necessaire ici, juste le nom d'utilisateur (voir Reglages >
ListenBrainz). Un token ne serait requis que pour soumettre des ecoutes
(scrobbling), deja fait par Navidrome directement - inutile de dupliquer ca.
"""

import httpx

API_BASE_URL = "https://api.listenbrainz.org"
LABS_BASE_URL = "https://labs.api.listenbrainz.org"

# Algorithme de similarite propose par l'API Labs (base sur les sessions
# d'ecoute reelles de l'ensemble des utilisateurs ListenBrainz, pas un simple
# partage de tags/genre) - une des configurations documentees/utilisees par
# listenbrainz.org lui-meme pour sa page "Similar artists".
SIMILAR_ARTISTS_ALGORITHM = (
    "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30"
)


def get_top_artists(username: str, count: int = 25, range_: str = "all_time") -> list[dict]:
    """Artistes les plus reellement ecoutes (pas suivis dans l'app) par
    l'utilisateur ListenBrainz sur la periode donnee - sert de graine pour les
    recommandations (voir get_recommendations_from_scrobbles ci-dessous).
    "all_time" par defaut plutot que "year" : un scrobbling tout juste active
    (cas courant ici, voir Reglages) n'a encore que quelques semaines/mois de
    donnees, insuffisant pour "year"/"month" qui peuvent alors renvoyer une
    liste vide meme avec un historique riche par ailleurs. Renvoie une liste
    vide si l'utilisateur n'existe pas/n'a pas encore assez d'ecoutes traitees
    (ListenBrainz recalcule ces stats periodiquement, pas en temps reel)."""
    resp = httpx.get(
        f"{API_BASE_URL}/1/stats/user/{username}/artists",
        params={"count": count, "range": range_},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    return ((resp.json() or {}).get("payload") or {}).get("artists", [])


def get_similar_artists(artist_mbids: list[str]) -> list[dict]:
    """Artistes similaires (algorithme collaboratif ListenBrainz) pour un ou
    plusieurs artistes de reference a la fois - la Labs API veut le parametre
    "artist_mbids" repete une fois par mbid (?artist_mbids=X&artist_mbids=Y),
    PAS une liste jointe par des virgules (verifie manuellement : renvoie une
    erreur 400 "not a valid uuid" sinon, le tout premier segment de la chaine
    jointe echouant la validation UUID) - httpx encode nativement une valeur
    de type list ainsi. Une seule requete pour tous les artistes a la fois,
    contrairement a l'API MusicBrainz (1 requete/artiste, throttlee a 1/s) :
    pas de limite equivalente ici a MAX_RECOMMENDATION_MBID_RESOLUTIONS.
    Chaque resultat porte un champ "reference_mbid" indiquant de quel artiste
    de depart il a ete calcule."""
    if not artist_mbids:
        return []
    resp = httpx.get(
        f"{LABS_BASE_URL}/similar-artists/json",
        params={"artist_mbids": artist_mbids, "algorithm": SIMILAR_ARTISTS_ALGORITHM},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    return resp.json() or []


def get_recommendations_from_scrobbles(username: str, top_count: int = 25) -> list[dict]:
    """Agrege top artistes reellement ecoutes (get_top_artists) -> artistes
    similaires (get_similar_artists) - meme principe que
    lastfm.get_similar_to_followed, mais la "graine" est ici l'ecoute reelle
    de l'utilisateur plutot que les artistes suivis dans l'app : peut faire
    remonter des artistes tres ecoutes sans avoir ete explicitement suivis.
    Chaque entree du resultat garde la trace du/des artiste(s) le/les plus
    ecoute(s) qui l'ont fait remonter (cle "sources", triee par contribution
    decroissante), pour affichage "Base sur : ..." cote frontend."""
    top = get_top_artists(username, count=top_count)
    top_by_mbid = {a["artist_mbid"]: a for a in top if a.get("artist_mbid")}
    if not top_by_mbid:
        return []

    similar = get_similar_artists(list(top_by_mbid.keys()))

    # La Labs API renvoie parfois plusieurs lignes identiques pour la meme
    # paire (reference, candidat) - verifie manuellement, comportement non
    # documente - sans dedup ici, une seule paire pouvait a la fois fausser le
    # score agrege (compte plusieurs fois) et polluer l'affichage "Base sur :
    # X, X, X..." cote frontend.
    seen_pairs: set[tuple[str, str]] = set()
    aggregated: dict[str, dict] = {}
    for candidate in similar:
        cand_mbid = candidate.get("artist_mbid")
        cand_name = candidate.get("name")
        ref_mbid = candidate.get("reference_mbid")
        reference = top_by_mbid.get(ref_mbid)
        if not cand_mbid or not cand_name or cand_mbid in top_by_mbid or not reference:
            continue
        if (cand_mbid, ref_mbid) in seen_pairs:
            continue
        seen_pairs.add((cand_mbid, ref_mbid))

        score = candidate.get("score") or 0
        entry = aggregated.setdefault(cand_mbid, {"name": cand_name, "mbid": cand_mbid, "score": 0, "sources": []})
        entry["score"] += score
        entry["sources"].append({"name": reference["artist_name"], "mbid": reference["artist_mbid"], "score": score})

    ranked = sorted(aggregated.values(), key=lambda e: e["score"], reverse=True)
    for entry in ranked:
        entry["sources"].sort(key=lambda s: s["score"], reverse=True)
    return ranked
