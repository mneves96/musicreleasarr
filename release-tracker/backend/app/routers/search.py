from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Artist
from ..schemas import ArtistSearchResult
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


@router.get("/artists", response_model=list[ArtistSearchResult])
def search_artists(q: str = Query(min_length=1), db: Session = Depends(get_db)):
    results = musicbrainz.search_artists(q)
    followed_ids = {
        a.musicbrainz_id
        for a in db.query(Artist).filter(Artist.is_followed.is_(True)).all()
    }

    with ThreadPoolExecutor(max_workers=8) as pool:
        images = list(pool.map(_image_for, [r["name"] for r in results]))

    return [
        ArtistSearchResult(
            musicbrainz_id=r["id"],
            name=r["name"],
            disambiguation=r.get("disambiguation"),
            image_url=image,
            already_followed=r["id"] in followed_ids,
        )
        for r, image in zip(results, images)
    ]
