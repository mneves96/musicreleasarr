from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Settings
from ..schemas import (
    NavidromeScanIn,
    NavidromeStatsOut,
    NowPlayingEntryOut,
    RecentlyPlayedAlbumOut,
    TestConnectionResult,
)
from ..scheduler import get_settings
from ..services import navidrome

router = APIRouter(prefix="/api/navidrome", tags=["navidrome"])


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
        scan = navidrome.get_scan_status(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
    except Exception as exc:
        raise HTTPException(502, f"Navidrome indisponible : {exc}") from exc

    return NavidromeStatsOut(
        artist_count=lib["artist_count"],
        album_count=lib["album_count"],
        scanning=scan["scanning"],
        last_scan_count=scan.get("count"),
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
        )
        for e in entries
    ]


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
