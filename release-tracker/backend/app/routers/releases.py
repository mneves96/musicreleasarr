from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..matching import normalize_text, similarity
from ..models import Artist, DownloadStatus, Release
from ..schemas import ReleaseOut, ReleasePageOut, TestConnectionResult, TrackOut
from ..scheduler import get_settings
from ..services import metube, navidrome, ytmusic

TRACK_TITLE_THRESHOLD = 0.85
RELEASES_DEFAULT_LIMIT = 40
RELEASES_MAX_LIMIT = 500

router = APIRouter(prefix="/api/releases", tags=["releases"])


@router.get("", response_model=ReleasePageOut)
def list_releases(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=RELEASES_DEFAULT_LIMIT, ge=1, le=RELEASES_MAX_LIMIT),
    q: str | None = Query(default=None),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    query = db.query(Release).filter(Release.artist.has(is_followed=True))
    if date_from:
        query = query.filter(Release.release_date >= date_from)
    if date_to:
        query = query.filter(Release.release_date <= date_to)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Release.title.ilike(like), Release.artist.has(Artist.name.ilike(like))))

    total = query.count()
    order_col = Release.release_date.asc() if order == "asc" else Release.release_date.desc()
    # selectinload evite un aller-retour DB par artiste distinct pour resoudre
    # ReleaseOut.artist_name/artist_image_url (proprietes lisant release.artist) -
    # notable des qu'une page contient des releases de plusieurs dizaines
    # d'artistes differents.
    releases = (
        query.options(selectinload(Release.artist))
        .order_by(order_col)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return ReleasePageOut(results=releases, total=total, offset=offset, limit=limit)


def _get_release_or_404(release_id: int, db: Session) -> Release:
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(404, "Release introuvable")
    return release


def _resolve_release_download_url(release: Release) -> str:
    """Lien "page album" YouTube Music a passer a MeTube (voir ytmusic.album_url) :
    c'est celui qui, teste manuellement dans MeTube, telecharge l'album complet en
    evitant la plupart des clips/versions live."""
    if release.youtube_music_url:
        return release.youtube_music_url
    browse_id = ytmusic.resolve_release_browse_id(
        release.artist.name, release.title, release.artist.ytmusic_browse_id
    )
    if not browse_id:
        raise HTTPException(422, "Aucun resultat YouTube Music trouve pour cette release")
    url = ytmusic.album_url(browse_id)
    release.youtube_music_url = url
    return url


@router.post("/{release_id}/download", response_model=TestConnectionResult)
def download_release(release_id: int, db: Session = Depends(get_db)):
    release = _get_release_or_404(release_id, db)
    settings = get_settings(db)
    if not settings.metube_url:
        raise HTTPException(422, "URL MeTube non configuree dans les reglages")

    url = _resolve_release_download_url(release)
    ok, message = metube.queue_download(settings.metube_url, url, folder=normalize_text(release.artist.name))
    release.download_status = DownloadStatus.queued if ok else DownloadStatus.failed
    release.download_error = None if ok else message
    db.commit()
    return TestConnectionResult(ok=ok, message=message)


@router.get("/{release_id}/tracks", response_model=list[TrackOut])
def list_tracks(release_id: int, db: Session = Depends(get_db)):
    release = _get_release_or_404(release_id, db)
    browse_id = ytmusic.resolve_release_browse_id(
        release.artist.name, release.title, release.artist.ytmusic_browse_id
    )
    if not browse_id:
        raise HTTPException(422, "Aucun resultat YouTube Music trouve pour cette release")
    details = ytmusic.get_release_details(browse_id)
    if not release.youtube_music_url:
        release.youtube_music_url = details["album_url"]
        db.commit()

    # Statut par piste (pas juste au niveau de la release) : le match album-level
    # peut etre un faux positif partiel (edition differente, pistes bonus...), donc
    # on compare chaque piste individuellement au contenu reel de Navidrome.
    owned_titles: list[str] | None = None
    settings = get_settings(db)
    if settings.navidrome_url and settings.navidrome_username and settings.navidrome_password:
        try:
            owned_titles = navidrome.get_owned_track_titles(
                settings.navidrome_url,
                settings.navidrome_username,
                settings.navidrome_password,
                release.artist.name,
                release.title,
            )
        except Exception:
            owned_titles = None

    tracks = details["tracks"]
    if owned_titles is not None:
        for track in tracks:
            track["owned"] = any(similarity(track["title"], t) >= TRACK_TITLE_THRESHOLD for t in owned_titles)
    return tracks


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
