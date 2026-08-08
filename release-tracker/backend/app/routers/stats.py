"""Favoris d'ecoute (artiste/album/piste le plus ecoute) pour le tableau de
bord - mixe Navidrome (stats de bibliotheque temps reel, voir
routers/navidrome.py) et Last.fm (seul a exposer un classement par periode,
voir services/lastfm.py:get_user_top_*) : l'API Subsonic de Navidrome ne
conserve qu'un compteur de lectures cumule + une derniere date d'ecoute,
aucun historique horodate - impossible d'en tirer une stat par periode.
"Cette annee" = 12 derniers mois glissants (period=12month de Last.fm), pas
l'annee civile, Last.fm n'offrant pas d'autre granularite. "Temps d'ecoute"
n'est fiable qu'au niveau piste (Last.fm fournit une duree par piste) - pour
artiste/album on affiche donc un nombre d'ecoutes (playcount), pas une duree
fabriquee.

Endpoint volontairement en lecture seule : aucun Artist n'est cree en base
ici (mbid resolu juste pour permettre le lien, comme
routers/artists.py:similar_artists) - seul le clic sur une entree cree la
fiche, via le flux previewArtist deja utilise par SearchPage/
SimilarArtistsSection."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..enrichment import resolve_mbid_by_name
from ..matching import best_match
from ..schemas import FavoritesOut, LastfmTopAlbumOut, LastfmTopArtistOut, LastfmTopTrackOut
from ..scheduler import FAVORITE_MATCH_THRESHOLD, get_settings
from ..services import coverart, lastfm, musicbrainz
from .artists import _enrich_track_album

logger = logging.getLogger("dedieufy.stats")

router = APIRouter(prefix="/api/stats", tags=["stats"])

_PERIOD_MAP = {"week": "7day", "month": "1month", "year": "12month"}
_ALBUM_MATCH_THRESHOLD = 0.7


def _resolve_artist_mbid(name: str, mbid: str | None) -> str | None:
    return mbid or resolve_mbid_by_name(name, threshold=FAVORITE_MATCH_THRESHOLD)


def _build_top_artist(entry: dict) -> LastfmTopArtistOut:
    name = entry.get("name", "")
    mbid = _resolve_artist_mbid(name, entry.get("mbid") or None)

    country, area_name = None, None
    if mbid:
        try:
            mb_artist = musicbrainz.get_artist(mbid)
            country, area_name = musicbrainz.extract_area(mb_artist)
        except Exception:
            logger.warning("Nationalite indisponible pour l'artiste prefere %s", name)

    return LastfmTopArtistOut(
        name=name,
        playcount=int(entry.get("playcount") or 0),
        image_url=lastfm.best_image({"image": entry.get("image")}) if entry.get("image") else None,
        musicbrainz_id=mbid,
        country=country,
        area_name=area_name,
    )


def _build_top_album(entry: dict) -> LastfmTopAlbumOut:
    name = entry.get("name", "")
    artist = entry.get("artist") or {}
    artist_name = artist.get("name", "")
    artist_mbid = _resolve_artist_mbid(artist_name, artist.get("mbid") or None)
    image_url = lastfm.best_image({"image": entry.get("image")}) if entry.get("image") else None

    release_date = None
    if artist_mbid:
        try:
            release_groups = musicbrainz.get_release_groups(artist_mbid)
        except Exception:
            release_groups = []
        if release_groups:
            idx = best_match(name, [rg.get("title", "") for rg in release_groups], threshold=_ALBUM_MATCH_THRESHOLD)
            if idx is not None:
                rg = release_groups[idx]
                release_date, _precision = musicbrainz.parse_release_date(rg.get("first-release-date"))
                if not image_url:
                    try:
                        image_url = coverart.get_release_group_cover(rg["id"])
                    except Exception:
                        pass

    return LastfmTopAlbumOut(
        name=name,
        artist_name=artist_name,
        artist_musicbrainz_id=artist_mbid,
        playcount=int(entry.get("playcount") or 0),
        image_url=image_url,
        release_date=release_date,
    )


def _build_top_track(entry: dict, lastfm_api_key: str) -> LastfmTopTrackOut:
    name = entry.get("name", "")
    artist = entry.get("artist") or {}
    artist_name = artist.get("name", "")
    artist_mbid = _resolve_artist_mbid(artist_name, artist.get("mbid") or None)
    playcount = int(entry.get("playcount") or 0)

    try:
        info = lastfm.get_track_info(artist_name, name, lastfm_api_key)
    except Exception:
        info = None
    album_title, cover_url, _release_date, _release_id = _enrich_track_album([], (info or {}).get("album") or {})

    try:
        duration_seconds = int(entry.get("duration") or 0)
    except (TypeError, ValueError):
        duration_seconds = 0
    estimated_hours = round(duration_seconds * playcount / 3600, 1) if duration_seconds else None

    return LastfmTopTrackOut(
        name=name,
        artist_name=artist_name,
        artist_musicbrainz_id=artist_mbid,
        album_title=album_title,
        cover_url=cover_url,
        playcount=playcount,
        estimated_hours=estimated_hours,
    )


_HOURS_ESTIMATE_TRACK_LIMIT = 50


def _estimate_hours(tracks: list[dict]) -> float | None:
    """Somme duree*lectures sur les pistes les plus ecoutees de la periode
    (voir _HOURS_ESTIMATE_TRACK_LIMIT) - Last.fm n'expose pas de vrai total
    de temps d'ecoute, ceci reste donc une estimation bornee au "top N",
    jamais un chiffre exact (voir FavoritesOut.estimated_hours). None si
    aucune piste n'a de duree connue plutot qu'un 0 trompeur."""
    total_seconds = 0
    has_duration = False
    for t in tracks:
        try:
            duration = int(t.get("duration") or 0)
            playcount = int(t.get("playcount") or 0)
        except (TypeError, ValueError):
            continue
        if duration:
            has_duration = True
            total_seconds += duration * playcount
    return round(total_seconds / 3600, 1) if has_duration else None


@router.get("/favorites", response_model=FavoritesOut)
def favorites(period: Literal["week", "month", "year"] = Query(default="week"), db: Session = Depends(get_db)):
    settings = get_settings(db)
    if not (settings.lastfm_api_key and settings.lastfm_username):
        raise HTTPException(422, "Connecte Last.fm dans Reglages pour les favoris d'ecoute")

    lastfm_period = _PERIOD_MAP[period]
    try:
        top_artists = lastfm.get_user_top_artists(settings.lastfm_username, settings.lastfm_api_key, lastfm_period, limit=1)
        top_albums = lastfm.get_user_top_albums(settings.lastfm_username, settings.lastfm_api_key, lastfm_period, limit=1)
        # limit=50 (pas 1) : reutilise pour a la fois la piste preferee
        # (premiere entree) et l'estimation globale d'heures d'ecoute
        # ci-dessous, plutot que deux appels Last.fm separes pour la meme
        # periode.
        top_tracks_raw = lastfm.get_user_top_tracks(
            settings.lastfm_username, settings.lastfm_api_key, lastfm_period, limit=_HOURS_ESTIMATE_TRACK_LIMIT
        )
    except Exception as exc:
        raise HTTPException(502, f"Last.fm indisponible : {exc}") from exc

    return FavoritesOut(
        top_artist=_build_top_artist(top_artists[0]) if top_artists else None,
        top_album=_build_top_album(top_albums[0]) if top_albums else None,
        top_track=_build_top_track(top_tracks_raw[0], settings.lastfm_api_key) if top_tracks_raw else None,
        estimated_hours=_estimate_hours(top_tracks_raw),
    )
