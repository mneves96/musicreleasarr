import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..enrichment import enrich_artist
from ..matching import best_match
from ..models import ALL_RELEASE_TYPES, Artist
from ..schemas import ArtistOut, ArtistSearchResult, ArtistUpdateIn, ArtistWithReleases, FollowArtistIn, TestConnectionResult
from ..services import lastfm, musicbrainz, navidrome
from .. import scheduler

logger = logging.getLogger("dedieufy.artists")

router = APIRouter(prefix="/api/artists", tags=["artists"])


@router.get("", response_model=list[ArtistOut])
def list_followed(db: Session = Depends(get_db)):
    return db.query(Artist).filter(Artist.is_followed.is_(True)).order_by(Artist.name).all()


def _get_or_create_artist(db: Session, musicbrainz_id: str) -> Artist:
    artist = db.query(Artist).filter(Artist.musicbrainz_id == musicbrainz_id).first()
    if artist is not None:
        return artist

    try:
        mb_artist = musicbrainz.get_artist(musicbrainz_id)
    except Exception as exc:
        # MusicBrainz est rate-limite/parfois lent : mieux vaut un 502 clair et
        # invitant a reessayer qu'un 500 brut qui laisse croire a un bug.
        raise HTTPException(502, f"MusicBrainz indisponible, reessaie dans un instant : {exc}") from exc

    artist = Artist(name=mb_artist["name"], musicbrainz_id=musicbrainz_id)
    settings = scheduler.get_settings(db)
    enrich_artist(artist, settings.lastfm_api_key, mb_artist=mb_artist)
    db.add(artist)
    db.commit()
    db.refresh(artist)
    return artist


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


@router.get("/recommended", response_model=list[ArtistSearchResult])
def recommended_artists(db: Session = Depends(get_db)):
    """Recommandations personnalisees Last.fm (necessite une connexion complete,
    voir routers/settings.py:lastfm-auth-*). Ne cree aucune ligne Artist en
    base - meme principe que /api/search/artists, la creation n'a lieu que si
    l'utilisateur suit/previsualise effectivement l'un des resultats.

    IMPORTANT : cette route doit rester declaree AVANT /{artist_id} ci-dessous,
    sinon Starlette la fait matcher comme artist_id="recommended" (404/422)."""
    settings = scheduler.get_settings(db)
    if not (settings.lastfm_api_key and settings.lastfm_api_secret and settings.lastfm_session_key):
        raise HTTPException(422, "Connecte Last.fm dans Reglages pour voir des recommandations")

    try:
        raw = lastfm.get_recommended_artists(settings.lastfm_api_key, settings.lastfm_api_secret, settings.lastfm_session_key)
    except Exception as exc:
        raise HTTPException(502, f"Last.fm indisponible : {exc}") from exc

    followed_ids = {a.musicbrainz_id for a in db.query(Artist).filter(Artist.is_followed.is_(True)).all()}

    # MusicBrainz limite a 1 requete/seconde : resoudre un mbid manquant pour
    # chaque recommandation pourrait faire trainer la reponse 20-30s+ si
    # beaucoup d'entre elles n'en ont pas (artistes peu connus). On borne le
    # nombre de resolutions tentees plutot que de faire attendre l'utilisateur
    # indefiniment - quitte a laisser de cote quelques recommandations obscures.
    MAX_MBID_RESOLUTIONS = 8
    resolutions_used = 0

    results: list[ArtistSearchResult] = []
    for item in raw:
        name = item.get("name")
        if not name:
            continue

        mbid = item.get("mbid") or None
        if not mbid:
            if resolutions_used >= MAX_MBID_RESOLUTIONS:
                continue
            resolutions_used += 1
            # Last.fm ne fournit pas toujours un mbid (artiste peu connu) - on
            # retente une resolution par nom, meme logique que l'import des
            # favoris Navidrome (scheduler._import_favorite_artist).
            try:
                candidates, _total = musicbrainz.search_artists(name, limit=5)
            except Exception:
                continue
            idx = best_match(name, [c["name"] for c in candidates], threshold=scheduler.FAVORITE_MATCH_THRESHOLD)
            if idx is None:
                continue
            mbid = candidates[idx]["id"]

        images = item.get("image") or []
        image_url = next((img.get("#text") for img in reversed(images) if img.get("#text")), None)
        results.append(
            ArtistSearchResult(
                musicbrainz_id=mbid,
                name=name,
                image_url=image_url,
                already_followed=mbid in followed_ids,
            )
        )
    return results


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
