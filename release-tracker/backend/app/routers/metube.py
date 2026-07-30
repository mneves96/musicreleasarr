"""Proxy vers l'API REST de MeTube : permet de reproduire son interface (ajout,
file d'attente, terminees, suppression, relance) directement dans l'app plutot
que via une iframe. Le navigateur n'a pas besoin de joindre MeTube directement,
tout passe par notre backend (qui, lui, connait deja metube_url)."""

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..scheduler import get_settings

router = APIRouter(prefix="/api/metube", tags=["metube"])


def _base_url(db: Session) -> str:
    settings = get_settings(db)
    if not settings.metube_url:
        raise HTTPException(422, "URL MeTube non configuree dans les reglages")
    return settings.metube_url.rstrip("/")


def _proxy(method: str, db: Session, path: str, json_body: dict | None = None) -> Any:
    url = f"{_base_url(db)}{path}"
    try:
        resp = httpx.request(method, url, json=json_body, timeout=30)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Impossible de joindre MeTube : {exc}") from exc

    if resp.status_code >= 400:
        try:
            detail = resp.json().get("msg") or resp.text
        except ValueError:
            detail = resp.text or resp.reason_phrase
        raise HTTPException(502, f"MeTube a refuse la requete : {detail}")

    if not resp.content:
        return {"status": "ok"}
    try:
        return resp.json()
    except ValueError:
        return {"status": "ok"}


@router.get("/history")
def history(db: Session = Depends(get_db)):
    return _proxy("GET", db, "/history")


@router.get("/presets")
def presets(db: Session = Depends(get_db)):
    return _proxy("GET", db, "/presets")


class AddIn(BaseModel):
    url: str
    download_type: str = "audio"
    quality: str = "best"
    format: str | None = None
    folder: str | None = None
    custom_name_prefix: str | None = None
    auto_start: bool = True


@router.post("/add")
def add(payload: AddIn, db: Session = Depends(get_db)):
    return _proxy("POST", db, "/add", payload.model_dump(exclude_none=True))


class IdsIn(BaseModel):
    ids: list[str]
    where: str  # "queue" | "done"


@router.post("/delete")
def delete(payload: IdsIn, db: Session = Depends(get_db)):
    if payload.where not in ("queue", "done"):
        raise HTTPException(422, "'where' doit etre 'queue' ou 'done'")
    return _proxy("POST", db, "/delete", payload.model_dump())


class StartIn(BaseModel):
    ids: list[str] = []


@router.post("/start")
def start(payload: StartIn, db: Session = Depends(get_db)):
    return _proxy("POST", db, "/start", payload.model_dump())


class RetryIn(BaseModel):
    id: str


@router.post("/retry")
def retry(payload: RetryIn, db: Session = Depends(get_db)):
    return _proxy("POST", db, "/retry", payload.model_dump())


@router.post("/cancel-add")
def cancel_add(db: Session = Depends(get_db)):
    return _proxy("POST", db, "/cancel-add", {})
