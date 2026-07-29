from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..enrichment import enrich_artist
from ..models import ALL_RELEASE_TYPES, Artist
from ..schemas import ArtistOut, ArtistUpdateIn, ArtistWithReleases, FollowArtistIn, TestConnectionResult
from ..services import musicbrainz, navidrome
from .. import scheduler

router = APIRouter(prefix="/api/artists", tags=["artists"])


@router.get("", response_model=list[ArtistOut])
def list_followed(db: Session = Depends(get_db)):
    return db.query(Artist).filter(Artist.is_followed.is_(True)).order_by(Artist.name).all()


@router.post("", response_model=ArtistOut)
def follow_artist(payload: FollowArtistIn, db: Session = Depends(get_db)):
    artist = db.query(Artist).filter(Artist.musicbrainz_id == payload.musicbrainz_id).first()

    if artist is None:
        mb_artist = musicbrainz.get_artist(payload.musicbrainz_id)
        artist = Artist(name=mb_artist["name"], musicbrainz_id=payload.musicbrainz_id)
        settings = scheduler.get_settings(db)
        enrich_artist(artist, settings.lastfm_api_key, mb_artist=mb_artist)
        db.add(artist)

    artist.is_followed = True
    artist.notify_enabled = payload.notify_enabled
    artist.auto_download = payload.auto_download
    artist.followed_release_types = [
        t for t in payload.followed_release_types if t in ALL_RELEASE_TYPES
    ]
    db.commit()
    db.refresh(artist)

    scheduler.scan_artist(db, artist)
    db.refresh(artist)
    return artist


@router.post("/import-favorites", response_model=TestConnectionResult)
def import_favorites(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    if not (settings.navidrome_url and settings.navidrome_username and settings.navidrome_password):
        raise HTTPException(422, "Connexion Navidrome non configuree dans les reglages")

    try:
        names = navidrome.get_starred_artists(
            settings.navidrome_url, settings.navidrome_username, settings.navidrome_password
        )
    except Exception as exc:
        raise HTTPException(502, f"Impossible de recuperer les favoris Navidrome : {exc}") from exc

    if not names:
        return TestConnectionResult(ok=True, message="Aucun artiste favori trouve dans Navidrome")

    background_tasks.add_task(scheduler.import_navidrome_favorite_artists, names)
    return TestConnectionResult(
        ok=True,
        message=f"Import lance pour {len(names)} artiste(s) favori(s) - ca peut prendre plusieurs minutes",
    )


@router.post("/{artist_id}/scan", response_model=TestConnectionResult)
def scan_artist_now(artist_id: int, db: Session = Depends(get_db)):
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(404, "Artiste introuvable")

    try:
        scheduler.scan_artist(db, artist)
    except Exception as exc:
        raise HTTPException(502, f"Echec du scan : {exc}") from exc

    return TestConnectionResult(ok=True, message="Scan termine")


@router.get("/{artist_id}", response_model=ArtistWithReleases)
def get_artist(artist_id: int, db: Session = Depends(get_db)):
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(404, "Artiste introuvable")
    return artist


@router.patch("/{artist_id}", response_model=ArtistOut)
def update_artist(artist_id: int, payload: ArtistUpdateIn, db: Session = Depends(get_db)):
    artist = db.get(Artist, artist_id)
    if artist is None:
        raise HTTPException(404, "Artiste introuvable")

    data = payload.model_dump(exclude_unset=True)
    if "followed_release_types" in data:
        data["followed_release_types"] = [
            t for t in data["followed_release_types"] if t in ALL_RELEASE_TYPES
        ]
    for key, value in data.items():
        setattr(artist, key, value)

    db.commit()
    db.refresh(artist)
    return artist
