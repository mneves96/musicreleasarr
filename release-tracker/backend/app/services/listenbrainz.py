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


def get_listen_count(username: str) -> int | None:
    """Nombre total d'ecoutes (scrobbles) enregistrees pour ce compte - utilise
    pour le widget "Scrobbling" du tableau de bord (voir routers/scrobbling.py).
    None si l'utilisateur n'existe pas/est injoignable, a distinguer de 0
    (compte existant mais sans ecoute)."""
    resp = httpx.get(f"{API_BASE_URL}/1/user/{username}/listen-count", timeout=15)
    if resp.status_code != 200:
        return None
    return ((resp.json() or {}).get("payload") or {}).get("count")


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


# Periodes cumulees pour constituer les graines - pas seulement "all_time" :
# sur un compte dont l'ecoute est concentree sur une poignee d'artistes en
# tout temps mais plus variee recemment, se limiter a all_time ne fait
# remonter des recommandations que par rapport a ces quelques artistes-la,
# peu diverses. L'union des trois periodes elargit le bassin de graines et
# fait apparaitre des artistes ecoutes recemment (semaine/mois) qui n'auraient
# jamais perce le classement all_time.
SEED_RANGES = ("week", "month", "all_time")


def get_recommendations_from_scrobbles(username: str, seed_count: int = 25, limit: int = 50) -> list[dict]:
    """Agrege top artistes reellement ecoutes sur plusieurs periodes
    (get_top_artists) -> artistes similaires (get_similar_artists) - meme
    principe que lastfm.get_similar_to_followed, mais la "graine" est ici
    l'ecoute reelle de l'utilisateur plutot que les artistes suivis dans
    l'app : peut faire remonter des artistes tres ecoutes sans avoir ete
    explicitement suivis. Chaque entree du resultat garde la trace du/des
    artiste(s) le/les plus ecoute(s) qui l'ont fait remonter (cle "sources",
    triee par contribution decroissante), pour affichage "Base sur : ..."
    cote frontend.

    La contribution de chaque graine est normalisee par son propre score
    maximum (0-1) avant d'etre sommee par candidat, plutot que de sommer les
    scores bruts de l'API : ceux-ci sont des comptages de sessions d'ecoute
    co-occurentes, dont l'ordre de grandeur suit surtout la popularite
    generale de la graine - sans normalisation, quelques graines tres
    populaires (typiquement issues de all_time) ecrasaient systematiquement
    les recommandations issues de graines plus confidentielles (typiquement
    issues de week/month), rendant le resultat final peu divers meme avec un
    bassin de graines elargi."""
    seeds: dict[str, dict] = {}
    for range_ in SEED_RANGES:
        for a in get_top_artists(username, count=seed_count, range_=range_):
            mbid = a.get("artist_mbid")
            if mbid and mbid not in seeds:
                seeds[mbid] = a
    if not seeds:
        return []

    similar = get_similar_artists(list(seeds.keys()))

    # La Labs API renvoie parfois plusieurs lignes identiques pour la meme
    # paire (reference, candidat) - verifie manuellement, comportement non
    # documente - sans dedup ici, une seule paire pouvait a la fois fausser le
    # score agrege (compte plusieurs fois) et polluer l'affichage "Base sur :
    # X, X, X..." cote frontend.
    seen_pairs: set[tuple[str, str]] = set()
    by_reference: dict[str, list[dict]] = {}
    for candidate in similar:
        cand_mbid = candidate.get("artist_mbid")
        cand_name = candidate.get("name")
        ref_mbid = candidate.get("reference_mbid")
        if not cand_mbid or not cand_name or cand_mbid in seeds or ref_mbid not in seeds:
            continue
        if (cand_mbid, ref_mbid) in seen_pairs:
            continue
        seen_pairs.add((cand_mbid, ref_mbid))
        by_reference.setdefault(ref_mbid, []).append(candidate)

    aggregated: dict[str, dict] = {}
    for ref_mbid, candidates in by_reference.items():
        reference = seeds[ref_mbid]
        max_score = max((c.get("score") or 0) for c in candidates) or 1
        for candidate in candidates:
            cand_mbid = candidate["artist_mbid"]
            normalized = (candidate.get("score") or 0) / max_score
            entry = aggregated.setdefault(
                cand_mbid, {"name": candidate["name"], "mbid": cand_mbid, "score": 0.0, "sources": []}
            )
            entry["score"] += normalized
            entry["sources"].append(
                {"name": reference["artist_name"], "mbid": reference["artist_mbid"], "score": normalized}
            )

    ranked = sorted(aggregated.values(), key=lambda e: e["score"], reverse=True)
    for entry in ranked:
        entry["sources"].sort(key=lambda s: s["score"], reverse=True)
    return ranked[:limit]
