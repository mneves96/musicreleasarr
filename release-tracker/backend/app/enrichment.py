"""Enrichissement d'un artiste (image, liens externes, nationalite, bio) : utilise
a la fois lors du suivi d'un nouvel artiste et pour rattraper les artistes deja
suivis auxquels il manque des informations (voir scheduler.backfill_artist_metadata)."""

import logging

from .models import Artist
from .services import deezer, lastfm, musicbrainz, ytmusic

logger = logging.getLogger("dedieufy.enrichment")


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
