"""Enrichissement d'un artiste (image, liens externes) : utilise a la fois lors
du suivi d'un nouvel artiste et pour rattraper les artistes deja suivis
auxquels il manque des informations (voir scheduler.backfill_artist_metadata)."""

import logging

from .models import Artist
from .services import deezer, lastfm, ytmusic

logger = logging.getLogger("dedieufy.enrichment")


def enrich_artist(artist: Artist, lastfm_api_key: str | None) -> None:
    if not artist.deezer_id or not artist.image_url:
        try:
            deezer_match = deezer.search_artist(artist.name)
            if deezer_match:
                artist.deezer_id = artist.deezer_id or str(deezer_match["id"])
                artist.image_url = artist.image_url or deezer_match.get("picture_xl")
        except Exception:
            logger.warning("Enrichissement Deezer indisponible pour %s", artist.name)

    if not artist.image_url or not artist.lastfm_url:
        try:
            info = lastfm.get_artist_info(artist.name, lastfm_api_key or "")
            artist.image_url = artist.image_url or lastfm.best_image(info)
            artist.lastfm_url = artist.lastfm_url or lastfm.artist_url(info)
        except Exception:
            logger.warning("Enrichissement Last.fm indisponible pour %s", artist.name)

    if not artist.ytmusic_browse_id:
        try:
            artist.ytmusic_browse_id = ytmusic.search_artist_browse_id(artist.name)
        except Exception:
            logger.warning("Enrichissement YouTube Music indisponible pour %s", artist.name)
