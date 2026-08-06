import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..enrichment import get_or_create_artist
from ..models import ALL_RELEASE_TYPES, Artist
from ..schemas import ArtistOut, ArtistUpdateIn, ArtistWithReleases, FollowArtistIn, TestConnectionResult
from ..services import navidrome
from .. import scheduler

logger = logging.getLogger("dedieufy.artists")

router = APIRouter(prefix="/api/artists", tags=["artists"])


@router.get("", response_model=list[ArtistOut])
def list_followed(db: Session = Depends(get_db)):
    return db.query(Artist).filter(Artist.is_followed.is_(True)).order_by(Artist.name).all()


def _get_or_create_artist(db: Session, musicbrainz_id: str) -> Artist:
    try:
        settings = scheduler.get_settings(db)
        return get_or_create_artist(db, musicbrainz_id, settings.lastfm_api_key)
    except Exception as exc:
        # MusicBrainz est rate-limite/parfois lent : mieux vaut un 502 clair et
        # invitant a reessayer qu'un 500 brut qui laisse croire a un bug.
        raise HTTPException(502, f"MusicBrainz indisponible, reessaie dans un instant : {exc}") from exc


def _scan_in_background(artist_id: int) -> None:
    """Le scan (decouverte MusicBrainz + YouTube Music) domine largement le temps
    de reponse de "suivre"/"previsualiser" un artiste (pagination MusicBrainz
    limitee a 1 req/s). On le deporte donc en tache de fond, avec sa propre
    session DB puisque celle de la requete HTTP sera deja fermee. Un echec ici
    (reseau flaky) sera retente par le cron ou le bouton "Actualiser"."""
    with SessionLocal() as db:
        artist = db.get(Artist, artist_id)
        if artist is None:
            return
        try:
            scheduler.scan_artist(db, artist)
        except Exception:
            logger.exception("Scan echoue pour %s, sera retente automatiquement", artist.name)


class PreviewIn(BaseModel):
    musicbrainz_id: str


@router.post("/preview", response_model=ArtistOut)
def preview_artist(payload: PreviewIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Cree/recupere la fiche d'un artiste et lance un scan en arriere-plan, sans
    le faire suivre - permet d'ouvrir la page d'un artiste trouve par la
    recherche pour consulter sa discographie avant de decider de le suivre."""
    artist = _get_or_create_artist(db, payload.musicbrainz_id)
    background_tasks.add_task(_scan_in_background, artist.id)
    return artist


@router.post("", response_model=ArtistOut)
def follow_artist(payload: FollowArtistIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    artist = _get_or_create_artist(db, payload.musicbrainz_id)

    artist.is_followed = True
    # Suivre une recommandation la fait sortir de la liste des recommandations
    # (voir GET /recommended, filtre sur is_followed=False) - on nettoie aussi
    # le flag lui-meme pour ne pas laisser une fiche "suivie" ET "recommandee"
    # en meme temps (invariant documente sur Artist.is_recommended).
    artist.is_recommended = False
    artist.recommended_because = None
    artist.notify_enabled = payload.notify_enabled
    artist.auto_download = payload.auto_download
    artist.followed_release_types = [
        t for t in payload.followed_release_types if t in ALL_RELEASE_TYPES
    ]
    db.commit()
    db.refresh(artist)

    background_tasks.add_task(_scan_in_background, artist.id)
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


@router.get("/recommended", response_model=list[ArtistOut])
def recommended_artists(db: Session = Depends(get_db)):
    """Recommandations personnalisees Last.fm, stockees comme de vraies lignes
    Artist (is_recommended=True) - meme table que les artistes suivis, meme
    schema de sortie, rafraichies chaque nuit par le scheduler (voir
    scheduler.refresh_lastfm_recommendations) ou a la demande via
    POST /recommended/refresh. Simple lecture DB : aucun appel reseau ici.

    IMPORTANT : cette route doit rester declaree AVANT /{artist_id} ci-dessous,
    sinon Starlette la fait matcher comme artist_id="recommended" (404/422)."""
    return (
        db.query(Artist)
        .filter(Artist.is_recommended.is_(True), Artist.is_followed.is_(False))
        .order_by(Artist.name)
        .all()
    )


@router.post("/recommended/refresh", response_model=TestConnectionResult)
def refresh_recommended_artists(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Rafraichissement manuel (bouton "Rafraichir" de l'onglet Recommandations),
    meme logique que le job nocturne - deportee en tache de fond car elle
    peut prendre plusieurs secondes/minutes (appels Last.fm + resolutions
    MusicBrainz limitees a 1 req/s)."""
    settings = scheduler.get_settings(db)
    if not (settings.lastfm_api_key and settings.lastfm_api_secret and settings.lastfm_session_key):
        raise HTTPException(422, "Connecte Last.fm dans Reglages pour rafraichir les recommandations")
    background_tasks.add_task(scheduler.run_refresh_lastfm_recommendations)
    return TestConnectionResult(ok=True, message="Rafraichissement des recommandations lance")


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

    if data.get("is_followed") is True:
        # Meme invariant que follow_artist() : une fiche suivie ne doit pas
        # rester marquee comme recommandation (ex: coche "Suivre cet artiste"
        # depuis la fiche d'un artiste recommande, voir ArtistPage.tsx).
        artist.is_recommended = False
        artist.recommended_because = None

    db.commit()
    db.refresh(artist)
    return artist
