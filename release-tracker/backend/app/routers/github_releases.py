"""Dernieres releases GitHub de projets dont l'app depend (Navidrome, MeTube)
pour les widgets du tableau de bord (voir services/github_releases.py)."""

import httpx
from fastapi import APIRouter, HTTPException

from ..schemas import GithubReleaseOut
from ..services import github_releases

router = APIRouter(prefix="/api/github-releases", tags=["github-releases"])

REPOS = {
    "navidrome": "navidrome/navidrome",
    "metube": "alexta69/metube",
}


@router.get("/{project}", response_model=list[GithubReleaseOut])
def latest_releases(project: str):
    repo = REPOS.get(project)
    if not repo:
        raise HTTPException(404, "Projet inconnu")
    try:
        return github_releases.get_latest_releases(repo)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Impossible de récupérer les releases GitHub : {exc}")
