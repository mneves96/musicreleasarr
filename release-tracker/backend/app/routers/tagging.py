"""Backlog de redressage metadata post-telechargement (voir services/tagging.py) :
liste les fichiers audio detectes dans le dossier de telechargement, sous
forme d'arborescence complete (TaggingItemOut.relative_path), et permet de les
rapprocher d'un album - recherche MusicBrainz automatique piste par piste
(scope "artistes suivis" ou "tout MusicBrainz"), recherche manuelle, ou
glisser-deposer entre albums/dossiers - avant confirmation explicite du
tagging + rangement. Rien n'est ecrit sur le disque sans un appel a /confirm."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Release, TaggingItem, TaggingStatus
from ..scheduler import get_settings
from ..schemas import (
    AssignItemsIn,
    ReleaseCardOut,
    ReleaseCreateIn,
    ReleaseGroupChoice,
    TaggingConfirmIn,
    TaggingItemOut,
    TaggingSearchIn,
    TestConnectionResult,
    TrackChoice,
)
from ..services import tagging
from .artists import _get_or_create_artist

logger = logging.getLogger("dedieufy.tagging.router")

router = APIRouter(prefix="/api/tagging", tags=["tagging"])


def _get_item_or_404(item_id: int, db: Session) -> TaggingItem:
    item = db.get(TaggingItem, item_id)
    if item is None:
        raise HTTPException(404, "Element de backlog introuvable")
    return item


def _get_release_or_404(release_id: int, db: Session) -> Release:
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(404, "Release introuvable")
    return release


def _require_release(item: TaggingItem) -> None:
    if item.release_id is None:
        raise HTTPException(422, "Ce fichier n'est pas encore identifie")


def _to_out(item: TaggingItem, downloads_root: str) -> TaggingItemOut:
    release = item.release
    return TaggingItemOut(
        id=item.id,
        release_id=item.release_id,
        artist_name=item.artist_name,
        release_title=item.release_title,
        release_cover_url=release.cover_url if release else None,
        release_date=release.release_date if release else None,
        source_folder=item.source_folder,
        source_path=item.source_path,
        relative_path=tagging.relative_source_path(item, downloads_root),
        original_filename=item.original_filename,
        status=item.status,
        suggested_track_title=item.suggested_track_title,
        suggested_track_number=item.suggested_track_number,
        suggested_disc_number=item.suggested_disc_number,
        match_score=item.match_score,
        target_path=item.target_path,
        error_message=item.error_message,
        created_at=item.created_at,
    )


@router.get("/backlog", response_model=list[TaggingItemOut])
def list_backlog(db: Session = Depends(get_db)):
    settings = get_settings(db)
    items = (
        db.query(TaggingItem)
        .filter(TaggingItem.status.in_([TaggingStatus.needs_review, TaggingStatus.error]))
        .order_by(TaggingItem.created_at.asc())
        .all()
    )
    return [_to_out(item, settings.tagging_downloads_path) for item in items]


@router.post("/scan", response_model=TestConnectionResult)
def scan_now(db: Session = Depends(get_db)):
    """Declenche immediatement le scan du dossier de telechargements (au lieu
    d'attendre le job planifie toutes les 5 min) - utile pour verifier tout de
    suite qu'un fichier fraichement depose est bien detecte."""
    settings = get_settings(db)
    try:
        created = tagging.scan_downloads_root(db, settings)
    except Exception as exc:
        db.rollback()
        logger.exception("Echec du scan du dossier de telechargements")
        raise HTTPException(500, f"Echec du scan : {exc}") from exc
    total_backlog = (
        db.query(TaggingItem).filter(TaggingItem.status.in_([TaggingStatus.needs_review, TaggingStatus.error])).count()
    )
    return TestConnectionResult(
        ok=True, message=f"{len(created)} fichier(s) (re)detecte(s) - {total_backlog} au total dans le backlog"
    )


@router.post("/search", response_model=list[TaggingItemOut])
def search(payload: TaggingSearchIn, db: Session = Depends(get_db)):
    """Recherche MusicBrainz sur une selection de fichiers de l'arborescence de
    gauche - piste par piste, comme le "Lookup" de Picard. scope="followed"
    tente un rapprochement nom-de-dossier <-> artiste suivi (rapide, limite a
    la bibliotheque) ; scope="musicbrainz" interroge MusicBrainz librement par
    fichier (plus lent - throttle 1 req/s - mais fonctionne pour n'importe
    quel artiste). Renvoie uniquement les fichiers effectivement matches."""
    settings = get_settings(db)
    if payload.scope == "followed":
        matched = tagging.auto_match_items(db, payload.item_ids)
    else:
        items = (
            db.query(TaggingItem)
            .filter(
                TaggingItem.id.in_(payload.item_ids),
                TaggingItem.release_id.is_(None),
                TaggingItem.status == TaggingStatus.needs_review,
            )
            .all()
        )
        tracklist_cache: dict[str, list[dict]] = {}
        matched = [
            item
            for item in items
            if tagging.search_musicbrainz_for_item(db, item, settings.lastfm_api_key, tracklist_cache)
        ]

    return [_to_out(item, settings.tagging_downloads_path) for item in matched]


@router.get("/identify/release-groups", response_model=list[ReleaseGroupChoice])
def identify_release_groups(artist_musicbrainz_id: str, db: Session = Depends(get_db)):
    return tagging.search_release_groups(artist_musicbrainz_id)


@router.post("/releases", response_model=ReleaseCardOut)
def create_release(payload: ReleaseCreateIn, db: Session = Depends(get_db)):
    """Ajoute une carte album a la colonne de droite du Backlog via recherche
    artiste -> release (barre de recherche au-dessus de la colonne) - aucun
    fichier n'y est encore rattache, l'utilisateur y glisse ensuite des
    fichiers/dossiers depuis l'arborescence de gauche."""
    artist = _get_or_create_artist(db, payload.artist_musicbrainz_id)
    release = tagging.get_or_create_release(
        db,
        artist,
        payload.release_group_musicbrainz_id,
        payload.release_title,
        payload.release_type,
        payload.release_date,
    )
    return ReleaseCardOut(
        release_id=release.id,
        artist_name=artist.name,
        release_title=release.title,
        cover_url=release.cover_url,
        release_date=release.release_date,
        release_type=release.release_type,
    )


@router.post("/releases/{release_id}/unlink", response_model=list[TaggingItemOut])
def unlink_release(release_id: int, db: Session = Depends(get_db)):
    """Supprime une carte album a droite (comme dans Picard) : les fichiers non
    confirmes qui y etaient rattaches redeviennent "non identifies" et
    reapparaissent dans l'arborescence de gauche."""
    release = _get_release_or_404(release_id, db)
    settings = get_settings(db)
    items = tagging.unlink_release_items(db, release)
    return [_to_out(item, settings.tagging_downloads_path) for item in items]


@router.post("/releases/{release_id}/assign-items", response_model=list[TaggingItemOut])
def assign_items(release_id: int, payload: AssignItemsIn, db: Session = Depends(get_db)):
    """Glisser-deposer d'un album ou d'un dossier sur cet album (les deux
    interactions demandees partagent le meme endpoint - seuls les item_ids
    fournis different) : reassigne les fichiers donnes et recalcule leur
    meilleure piste dans la tracklist de cet album (voir
    services/tagging.py:assign_items_to_release pour le seuil de confiance en
    dessous duquel un fichier reste "sans correspondance")."""
    release = _get_release_or_404(release_id, db)
    settings = get_settings(db)
    items = tagging.assign_items_to_release(db, payload.item_ids, release)
    if not items:
        raise HTTPException(404, "Aucun fichier a reassigner")
    return [_to_out(item, settings.tagging_downloads_path) for item in items]


@router.get("/releases/{release_id}/tracklist", response_model=list[TrackChoice])
def release_tracklist(release_id: int, db: Session = Depends(get_db)):
    """Tracklist MusicBrainz d'une release, independamment de savoir si un
    fichier y est deja rattache - permet a une carte album vide (ajoutee via
    la recherche manuelle, avant tout glisser-deposer) d'afficher ses pistes
    tout de suite."""
    release = _get_release_or_404(release_id, db)
    return tagging.get_tracklist_choices(release)


@router.post("/{item_id}/confirm", response_model=TaggingItemOut)
def confirm(item_id: int, payload: TaggingConfirmIn, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    _require_release(item)
    settings = get_settings(db)
    updated = tagging.apply_tag_and_move(
        db,
        settings,
        item,
        payload.track_title,
        payload.track_number,
        payload.disc_number,
        payload.recording_id,
        payload.release_mbid,
        payload.track_artist_credit,
    )
    return _to_out(updated, settings.tagging_downloads_path)


@router.post("/{item_id}/rescan", response_model=TaggingItemOut)
def rescan(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    _require_release(item)
    updated = tagging.rescan_item(db, item)
    settings = get_settings(db)
    return _to_out(updated, settings.tagging_downloads_path)


@router.delete("/{item_id}")
def discard(item_id: int, db: Session = Depends(get_db)):
    item = _get_item_or_404(item_id, db)
    db.delete(item)
    db.commit()
    return {"status": "ok"}
