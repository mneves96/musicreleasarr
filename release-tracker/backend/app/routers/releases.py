from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..matching import normalize_text
from ..models import DownloadStatus, Release
from ..schemas import ReleaseOut, TestConnectionResult, TrackOut
from ..scheduler import get_settings
from ..services import metube, ytmusic

router = APIRouter(prefix="/api/releases", tags=["releases"])


@router.get("", response_model=list[ReleaseOut])
def list_releases(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
):
    query = db.query(Release).filter(Release.artist.has(is_followed=True))
    if date_from:
        query = query.filter(Release.release_date >= date_from)
    if date_to:
        query = query.filter(Release.release_date <= date_to)
    return query.order_by(Release.release_date.desc()).all()


def _get_release_or_404(release_id: int, db: Session) -> Release:
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(404, "Release introuvable")
    return release


def _resolve_youtube_details(release: Release) -> dict:
    """Retourne {"playlist_url", "tracks"} ; met a jour release.youtube_music_url
    si un lien de playlist a ete trouve (sans jamais l'ecraser par None)."""
    if release.youtube_music_url:
        return {"playlist_url": release.youtube_music_url, "tracks": []}
    browse_id = ytmusic.search_release_browse_id(release.artist.name, release.title)
    if not browse_id:
        raise HTTPException(422, "Aucun resultat YouTube Music trouve pour cette release")
    details = ytmusic.get_release_details(browse_id)
    if details["playlist_url"]:
        release.youtube_music_url = details["playlist_url"]
    return details


@router.post("/{release_id}/download", response_model=TestConnectionResult)
def download_release(release_id: int, db: Session = Depends(get_db)):
    release = _get_release_or_404(release_id, db)
    settings = get_settings(db)
    if not settings.metube_url:
        raise HTTPException(422, "URL MeTube non configuree dans les reglages")

    details = _resolve_youtube_details(release)
    ok, message = metube.queue_release(
        settings.metube_url,
        normalize_text(release.artist.name),
        details["playlist_url"],
        [t["video_id"] for t in details["tracks"]],
    )
    release.download_status = DownloadStatus.queued if ok else DownloadStatus.failed
    db.commit()
    return TestConnectionResult(ok=ok, message=message)


@router.get("/{release_id}/tracks", response_model=list[TrackOut])
def list_tracks(release_id: int, db: Session = Depends(get_db)):
    release = _get_release_or_404(release_id, db)
    browse_id = ytmusic.search_release_browse_id(release.artist.name, release.title)
    if not browse_id:
        raise HTTPException(422, "Aucun resultat YouTube Music trouve pour cette release")
    details = ytmusic.get_release_details(browse_id)
    if not release.youtube_music_url and details["playlist_url"]:
        release.youtube_music_url = details["playlist_url"]
        db.commit()
    return details["tracks"]


@router.post("/{release_id}/tracks/{video_id}/download", response_model=TestConnectionResult)
def download_track(release_id: int, video_id: str, db: Session = Depends(get_db)):
    release = _get_release_or_404(release_id, db)
    settings = get_settings(db)
    if not settings.metube_url:
        raise HTTPException(422, "URL MeTube non configuree dans les reglages")

    ok, message = metube.queue_download(
        settings.metube_url,
        f"https://music.youtube.com/watch?v={video_id}",
        folder=normalize_text(release.artist.name),
    )
    return TestConnectionResult(ok=ok, message=message)
