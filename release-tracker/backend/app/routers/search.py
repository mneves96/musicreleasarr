from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Artist
from ..schemas import ArtistSearchPage, ArtistSearchResult
from ..services import deezer, musicbrainz

router = APIRouter(prefix="/api/search", tags=["search"])


def _image_for(name: str) -> str | None:
    try:
        match = deezer.search_artist(name)
        if match:
            return match.get("picture_medium") or match.get("picture_big")
    except Exception:
        pass
    return None


@router.get("/artists", response_model=ArtistSearchPage)
def search_artists(
    q: str = Query(min_length=1),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    country: str | None = None,
    tag: str | None = None,
    artist_type: str | None = Query(default=None, alias="type"),
    db: Session = Depends(get_db),
):
    results, total = musicbrainz.search_artists(
        q, limit=limit, offset=offset, country=country, artist_type=artist_type, tag=tag
    )
    followed_ids = {
        a.musicbrainz_id
        for a in db.query(Artist).filter(Artist.is_followed.is_(True)).all()
    }

    # Requetes Deezer (image) en parallele - uniquement pour la page courante,
    # pas tous les resultats : la pagination limite deja le cout par requete.
    with ThreadPoolExecutor(max_workers=8) as pool:
        images = list(pool.map(_image_for, [r["name"] for r in results]))

    items = [
        ArtistSearchResult(
            musicbrainz_id=r["id"],
            name=r["name"],
            disambiguation=r.get("disambiguation"),
            image_url=image,
            already_followed=r["id"] in followed_ids,
            country=r.get("country"),
            area_name=(r.get("area") or {}).get("name"),
            artist_type=r.get("type"),
        )
        for r, image in zip(results, images)
    ]
    return ArtistSearchPage(results=items, total=total, offset=offset, limit=limit)
