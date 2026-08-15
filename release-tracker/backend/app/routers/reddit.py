"""Posts recents de r/navidrome pour le widget du tableau de bord (voir
services/reddit.py pour le detail du flux RSS utilise)."""

import httpx
from fastapi import APIRouter, HTTPException

from ..schemas import RedditPostOut
from ..services import reddit

router = APIRouter(prefix="/api/reddit", tags=["reddit"])


@router.get("/navidrome-posts", response_model=list[RedditPostOut])
def navidrome_posts():
    try:
        return reddit.get_navidrome_posts()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Impossible de récupérer les posts Reddit : {exc}")
