"""Backlog de redressage metadata post-telechargement (voir services/tagging.py) :
liste les fichiers audio detectes dans le dossier de telechargement et permet
de confirmer/corriger la piste correspondante avant tagging+deplacement, ou
d'identifier manuellement un dossier qui ne correspond a aucun artiste suivi
(recherche MusicBrainz, l'equivalent du "Lookup" de Picard). Rien n'est ecrit
sur le disque sans un appel explicite a /confirm."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Release, TaggingItem, TaggingStatus
from ..scheduler import get_settings
from ..schemas import ReleaseGroupChoice, TaggingConfirmIn, TaggingIdentifyIn, TaggingItemOut, TestConnectionResult, TrackChoice
from ..services import tagging
from .artists import _get_or_create_artist

router = APIRouter(prefix="/api/tagging", tags=["tagging"])


def _get_item_or_404(item_id: int, db: Session) -> TaggingItem:
    item = db.get(TaggingItem, item_id)
    if item is None:
        raise HTTPException(404, "Element de backlog introuvable")
    return item


def _require_release(item: TaggingItem) -> None:
    if item.release_id is None:
        raise HTTPException(422, "Ce fichier n'est pas encore identifie - utilise POST /api/tagging/identify")


@router.get("/backlog", response_model=list[TaggingItemOut])
def list_backlog(db: Session = Depends(get_db)):
    return (
        db.query(TaggingItem)
        .filter(TaggingItem.status.in_([TaggingStatus.needs_review, TaggingStatus.error]))
        .order_by(TaggingItem.created_at.asc())
        .all()
    )


@router.post("/scan", response_model=TestConnectionResult)
def scan_now(db: Session = Depends(get_db)):
    """Declenche immediatement le scan du dossier de telechargements (au lieu
    d'attendre le job planifie toutes les 5 min) - utile pour verifier tout de
    suite qu'un fichier fraichement depose est bien detecte."""
    settings = get_settings(db)
    created = tagging.scan_downloads_root(db, settings)
    total_backlog = (
        db.query(TaggingItem).filter(TaggingItem.status.in_([TaggingStatus.needs_review, TaggingStatus.error])).count()
    )
    return TestConnectionResult(
        ok=True, message=f"{len(created)} fichier(s) (re)detecte(s) - {total_backlog} au total dans le backlog"
    )


@router.get("/identify/release-groups", response_model=list[ReleaseGroupChoice])
def identify_release_groups(artist_musicbrainz_id: str, db: Session = Depends(get_db)):
    return tagging.search_release_groups(artist_musicbrainz_id)


@router.post("/identify", response_model=list[TaggingItemOut])
def identify(payload: TaggingIdentifyIn, db: Session = Depends(get_db)):
    """Rattache un dossier "non identifie" a une release choisie manuellement
    (recherche MusicBrainz cote frontend) : cree l'artiste/la release s'ils
    n'existent pas encore (sans forcement les faire suivre), puis propose une
    correspondance piste par piste sur les fichiers de ce dossier."""
    artist = _get_or_create_artist(db, payload.artist_musicbrainz_id)

    release = db.query(Release).filter(Release.musicbrainz_id == payload.release_group_musicbrainz_id).first()
    if release is None:
        release = Release(
            artist_id=artist.id,
            title=payload.release_title,
            release_type=payload.release_type,
            release_date=payload.release_date,
            musicbrainz_id=payload.release_group_musicbrainz_id,
        )
        db.add(release)
        db.commit()
        db.refresh(release)

    items = tagging.identify_folder(db, payload.source_folder, release)
    if not items:
        raise HTTPException(404, "Aucun fichier non identifie trouve dans ce dossier")
    return items


@router.get("/{item_id}/tracklist", response_model=list[TrackChoice])
def tracklist(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    _require_release(item)
    return tagging.get_tracklist_choices(item.release)


@router.post("/{item_id}/confirm", response_model=TaggingItemOut)
def confirm(item_id: int, payload: TaggingConfirmIn, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    _require_release(item)
    settings = get_settings(db)
    return tagging.apply_tag_and_move(
        db, settings, item, payload.track_title, payload.track_number, payload.disc_number, payload.recording_id
    )


@router.post("/{item_id}/rescan", response_model=TaggingItemOut)
def rescan(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    _require_release(item)
    return tagging.rescan_item(db, item)


@router.delete("/{item_id}")
def discard(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    db.delete(item)
    db.commit()
    return {"status": "ok"}
