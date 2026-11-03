"""Onglet Lyrics : statistiques des paroles de la bibliotheque, scan pour les
rafraichir et mise a jour via lrclib (voir services/lyrics.py). Scan et mise
a jour tournent en arriere-plan - le frontend sonde GET /job pour suivre la
progression."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import LyricsStatus, LyricsTrack
from ..schemas import LyricsErrorGroupOut, LyricsJobIn, LyricsJobOut, LyricsStatsOut, LyricsTrackPage
from ..services import lyrics

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


@router.get("/stats", response_model=LyricsStatsOut)
def stats(db: Session = Depends(get_db)):
    counts = dict(db.query(LyricsTrack.status, func.count(LyricsTrack.id)).group_by(LyricsTrack.status).all())
    cutoff = datetime.utcnow() - lyrics.LOOKUP_RETRY_DELAY
    not_found_recently = (
        db.query(LyricsTrack)
        .filter(
            LyricsTrack.status.in_([LyricsStatus.missing, LyricsStatus.plain]),
            LyricsTrack.lookup_at >= cutoff,
            LyricsTrack.lookup_result != "error",
        )
        .count()
    )
    errors = (
        db.query(LyricsTrack)
        .filter(LyricsTrack.status.in_([LyricsStatus.missing, LyricsStatus.plain]), LyricsTrack.lookup_result == "error")
        .count()
    )
    return LyricsStatsOut(
        total=sum(counts.values()),
        missing=counts.get(LyricsStatus.missing, 0),
        plain=counts.get(LyricsStatus.plain, 0),
        synced=counts.get(LyricsStatus.synced, 0),
        update_candidates=lyrics.update_candidates_query(db).count(),
        not_found_recently=not_found_recently,
        errors=errors,
        last_scan_at=db.query(func.max(LyricsTrack.scanned_at)).scalar(),
    )


@router.get("/errors", response_model=list[LyricsErrorGroupOut])
def errors(db: Session = Depends(get_db)):
    """Erreurs de la derniere tentative de mise a jour, regroupees par cause -
    avec un exemple (chemin + message brut) pour diagnostiquer."""
    rows = (
        db.query(LyricsTrack)
        .filter(LyricsTrack.status.in_([LyricsStatus.missing, LyricsStatus.plain]), LyricsTrack.lookup_result == "error")
        .order_by(LyricsTrack.lookup_at.desc())
        .all()
    )
    groups: dict[str, LyricsErrorGroupOut] = {}
    for row in rows:
        category = row.lookup_error or "Erreur inconnue"
        if category in groups:
            groups[category].count += 1
        else:
            groups[category] = LyricsErrorGroupOut(
                category=category, count=1, example_path=row.path, example_detail=row.lookup_error_detail
            )
    return sorted(groups.values(), key=lambda g: g.count, reverse=True)


@router.get("/job", response_model=LyricsJobOut)
def job_status():
    state = lyrics.get_job_state()
    return LyricsJobOut(**{k: v for k, v in state.items() if k != "cancel_requested"})


def _start(kind: str, target, force: bool) -> LyricsJobOut:
    if not lyrics.start_job(kind, target, force):
        raise HTTPException(409, "Un scan ou une mise à jour des paroles est déjà en cours")
    return job_status()


@router.post("/scan", response_model=LyricsJobOut)
def scan(payload: LyricsJobIn):
    return _start("scan", lyrics.scan_library, payload.force)


@router.post("/update", response_model=LyricsJobOut)
def update(payload: LyricsJobIn):
    return _start("update", lyrics.update_lyrics, payload.force)


@router.post("/cancel", response_model=LyricsJobOut)
def cancel():
    lyrics.request_cancel()
    return job_status()


@router.get("/tracks", response_model=LyricsTrackPage)
def tracks(
    status: LyricsStatus | None = None,
    errors_only: bool = False,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(LyricsTrack)
    if status is not None:
        query = query.filter(LyricsTrack.status == status)
    if errors_only:
        query = query.filter(
            LyricsTrack.status.in_([LyricsStatus.missing, LyricsStatus.plain]), LyricsTrack.lookup_result == "error"
        )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(LyricsTrack.artist.ilike(like), LyricsTrack.title.ilike(like), LyricsTrack.album.ilike(like))
        )
    total = query.count()
    items = (
        query.order_by(LyricsTrack.artist, LyricsTrack.album, LyricsTrack.path)
        .offset(offset)
        .limit(min(limit, 500))
        .all()
    )
    return LyricsTrackPage(items=items, total=total)
