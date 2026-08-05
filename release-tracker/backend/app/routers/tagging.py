"""Backlog de redressage metadata post-telechargement (voir services/tagging.py) :
liste les fichiers audio detectes dans le dossier de telechargement MeTube et
permet de confirmer/corriger la piste correspondante avant tagging+deplacement.
Rien n'est ecrit sur le disque sans un appel explicite a /confirm."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import TaggingItem, TaggingStatus
from ..scheduler import get_settings
from ..schemas import TaggingConfirmIn, TaggingItemOut, TrackChoice
from ..services import tagging

router = APIRouter(prefix="/api/tagging", tags=["tagging"])


def _get_item_or_404(item_id: int, db: Session) -> TaggingItem:
    item = db.get(TaggingItem, item_id)
    if item is None:
        raise HTTPException(404, "Element de backlog introuvable")
    return item


@router.get("/backlog", response_model=list[TaggingItemOut])
def list_backlog(db: Session = Depends(get_db)):
    return (
        db.query(TaggingItem)
        .filter(TaggingItem.status.in_([TaggingStatus.needs_review, TaggingStatus.error]))
        .order_by(TaggingItem.created_at.asc())
        .all()
    )


@router.get("/{item_id}/tracklist", response_model=list[TrackChoice])
def tracklist(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    return tagging.get_tracklist_choices(item.release)


@router.post("/{item_id}/confirm", response_model=TaggingItemOut)
def confirm(item_id: int, payload: TaggingConfirmIn, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    settings = get_settings(db)
    return tagging.apply_tag_and_move(
        db, settings, item, payload.track_title, payload.track_number, payload.disc_number
    )


@router.post("/{item_id}/rescan", response_model=TaggingItemOut)
def rescan(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    return tagging.rescan_item(db, item)


@router.delete("/{item_id}")
def discard(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    db.delete(item)
    db.commit()
    return {"status": "ok"}
