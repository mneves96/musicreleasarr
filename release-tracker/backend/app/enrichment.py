"""Enrichissement d'un artiste (image, liens externes, nationalite, bio) : utilise
a la fois lors du suivi d'un nouvel artiste et pour rattraper les artistes deja
suivis auxquels il manque des informations (voir scheduler.backfill_artist_metadata)."""

import logging

from sqlalchemy.orm import Session

from .matching import best_match
from .models import Artist
from .services import deezer, lastfm, musicbrainz, ytmusic

logger = logging.getLogger("dedieufy.enrichment")

# Duplique volontairement scheduler.FAVORITE_MATCH_THRESHOLD (meme valeur) :
# scheduler.py importe deja get_or_create_artist depuis ce module, un import
# dans l'autre sens creerait un cycle.
_NAME_RESOLUTION_THRESHOLD = 0.85


def resolve_mbid_by_name(name: str, threshold: float = _NAME_RESOLUTION_THRESHOLD) -> str | None:
    """Resout un mbid MusicBrainz a partir d'un simple nom d'artiste - repli
    utilise partout ou une source externe (Last.fm) ne fournit pas toujours
    de mbid (artiste peu connu) : recommandations nocturnes
    (scheduler.refresh_lastfm_recommendations), artistes similaires
    (routers/artists.py:similar_artists) et favoris d'ecoute
    (routers/stats.py). None si MusicBrainz est indisponible ou qu'aucun
    candidat n'atteint le seuil de confiance plutot qu'une resolution
    hasardeuse."""
    try:
        candidates, _total = musicbrainz.search_artists(name, limit=5)
    except Exception:
        return None
    idx = best_match(name, [c["name"] for c in candidates], threshold=threshold)
    if idx is None:
        return None
    return candidates[idx]["id"]


def get_or_create_artist(db: Session, musicbrainz_id: str, lastfm_api_key: str | None) -> Artist:
    """Recupere l'Artist existant pour ce musicbrainz_id ou en cree un nouveau
    (fiche MusicBrainz + enrichissement) - partage entre le suivi/previsualisation
    manuels (routers/artists.py) et les imports automatiques (favoris Navidrome,
    recommandations Last.fm, voir scheduler.py) pour eviter que ces chemins ne
    divergent. Laisse remonter les exceptions MusicBrainz telles quelles ; c'est
    a l'appelant de decider comment les reporter (HTTPException cote routeur,
    simple log cote job planifie)."""
    artist = db.query(Artist).filter(Artist.musicbrainz_id == musicbrainz_id).first()
    if artist is not None:
        return artist

    mb_artist = musicbrainz.get_artist(musicbrainz_id)
    artist = Artist(name=mb_artist["name"], musicbrainz_id=musicbrainz_id)
    enrich_artist(artist, lastfm_api_key, mb_artist=mb_artist)
    db.add(artist)
    db.commit()
    db.refresh(artist)
    return artist


def enrich_artist(artist: Artist, lastfm_api_key: str | None, mb_artist: dict | None = None) -> None:
    if not artist.country or not artist.area_name:
        try:
            data = mb_artist or musicbrainz.get_artist(artist.musicbrainz_id)
            country, area_name = musicbrainz.extract_area(data)
            artist.country = artist.country or country
            artist.area_name = artist.area_name or area_name
        except Exception:
            logger.warning("Enrichissement nationalite (MusicBrainz) indisponible pour %s", artist.name)

    if not artist.deezer_id or not artist.image_url:
        try:
            deezer_match = deezer.search_artist(artist.name)
            if deezer_match:
                artist.deezer_id = artist.deezer_id or str(deezer_match["id"])
                artist.image_url = artist.image_url or deezer_match.get("picture_xl")
        except Exception:
            logger.warning("Enrichissement Deezer indisponible pour %s", artist.name)

    if not artist.image_url or not artist.lastfm_url or not artist.bio:
        try:
            info = lastfm.get_artist_info(artist.name, lastfm_api_key or "")
            artist.image_url = artist.image_url or lastfm.best_image(info)
            artist.lastfm_url = artist.lastfm_url or lastfm.artist_url(info)
            artist.bio = artist.bio or lastfm.bio_summary(info)
        except Exception:
            logger.warning("Enrichissement Last.fm indisponible pour %s", artist.name)

    if not artist.ytmusic_browse_id:
        try:
            artist.ytmusic_browse_id = ytmusic.search_artist_browse_id(artist.name)
        except Exception:
            logger.warning("Enrichissement YouTube Music indisponible pour %s", artist.name)
