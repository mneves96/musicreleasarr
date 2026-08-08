from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Settings
from ..schemas import (
    GenreStatOut,
    NavidromeScanIn,
    NavidromeStatsOut,
    NowPlayingEntryOut,
    RecentlyPlayedAlbumOut,
    TestConnectionResult,
)
from ..scheduler import get_settings
from ..services import navidrome

router = APIRouter(prefix="/api/navidrome", tags=["navidrome"])

TOP_GENRES_LIMIT = 5


def _require_navidrome(db: Session) -> Settings:
    settings = get_settings(db)
    if not (settings.navidrome_url and settings.navidrome_username and settings.navidrome_password):
        raise HTTPException(422, "Connexion Navidrome non configuree dans les reglages")
    return settings


@router.get("/stats", response_model=NavidromeStatsOut)
def stats(db: Session = Depends(get_db)):
    settings = _require_navidrome(db)
    try:
        lib = navidrome.get_library_stats(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
        song_count = navidrome.get_song_count(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
        scan = navidrome.get_scan_status(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
        genres = navidrome.get_genres(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
    except Exception as exc:
        raise HTTPException(502, f"Navidrome indisponible : {exc}") from exc

    top_genres = sorted(genres, key=lambda g: g.get("songCount") or 0, reverse=True)[:TOP_GENRES_LIMIT]

    return NavidromeStatsOut(
        artist_count=lib["artist_count"],
        album_count=lib["album_count"],
        song_count=song_count,
        scanning=scan["scanning"],
        last_scan_count=scan.get("count"),
        top_genres=[
            GenreStatOut(
                name=g.get("value", ""),
                song_count=g.get("songCount") or 0,
                percent=round((g.get("songCount") or 0) / song_count * 100, 1) if song_count else 0.0,
            )
            for g in top_genres
        ],
    )


@router.get("/now-playing", response_model=list[NowPlayingEntryOut])
def now_playing(db: Session = Depends(get_db)):
    settings = _require_navidrome(db)
    try:
        entries = navidrome.get_now_playing(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
    except Exception as exc:
        raise HTTPException(502, f"Navidrome indisponible : {exc}") from exc

    return [
        NowPlayingEntryOut(
            username=e.get("username"),
            title=e.get("title"),
            artist=e.get("artist"),
            album=e.get("album"),
            minutes_ago=e.get("minutesAgo"),
            player_name=e.get("playerName"),
            cover_art_id=e.get("coverArt"),
        )
        for e in entries
    ]


@router.get("/cover-art/{cover_id}")
def cover_art(cover_id: str, db: Session = Depends(get_db)):
    """Relaie une cover Navidrome (auth Subsonic signee, le frontend n'a pas
    les identifiants) - consomme directement en <img src="/api/navidrome/cover-art/{id}">."""
    settings = _require_navidrome(db)
    try:
        content, content_type = navidrome.get_cover_art(
            settings.navidrome_url, settings.navidrome_username, settings.navidrome_password, cover_id
        )
    except Exception as exc:
        raise HTTPException(502, f"Navidrome indisponible : {exc}") from exc
    return Response(content=content, media_type=content_type)


@router.get("/recently-played", response_model=list[RecentlyPlayedAlbumOut])
def recently_played(db: Session = Depends(get_db)):
    settings = _require_navidrome(db)
    try:
        albums = navidrome.get_recently_played(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
    except Exception as exc:
        raise HTTPException(502, f"Navidrome indisponible : {exc}") from exc

    results = []
    for a in albums:
        played = None
        raw_played = a.get("played")
        if raw_played:
            try:
                played = datetime.fromisoformat(raw_played.replace("Z", "+00:00"))
            except ValueError:
                played = None
        results.append(
            RecentlyPlayedAlbumOut(
                id=str(a.get("id", "")),
                name=a.get("name") or a.get("title") or "",
                artist=a.get("artist"),
                play_count=a.get("playCount"),
                played=played,
            )
        )
    return results


@router.post("/scan", response_model=TestConnectionResult)
def scan(payload: NavidromeScanIn, db: Session = Depends(get_db)):
    settings = _require_navidrome(db)
    ok, message = navidrome.start_scan(
        settings.navidrome_url, settings.navidrome_username, settings.navidrome_password, full=payload.full
    )
    return TestConnectionResult(ok=ok, message=message)
