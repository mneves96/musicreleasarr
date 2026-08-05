import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from .. import scheduler
from ..schemas import LastfmAuthFinishIn, LastfmAuthStartOut, SettingsOut, SettingsUpdateIn, TestConnectionResult
from ..services import lastfm, navidrome, notify

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    if not settings.calendar_token:
        settings.calendar_token = secrets.token_urlsafe(24)
        db.commit()
        db.refresh(settings)
    return settings


@router.post("/regenerate-calendar-token", response_model=SettingsOut)
def regenerate_calendar_token(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    settings.calendar_token = secrets.token_urlsafe(24)
    db.commit()
    db.refresh(settings)
    return settings


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdateIn, db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    scheduler.reschedule()
    return settings


@router.post("/test-metube", response_model=TestConnectionResult)
def test_metube(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    if not settings.metube_url:
        return TestConnectionResult(ok=False, message="URL MeTube non renseignee")
    try:
        resp = httpx.get(settings.metube_url, timeout=10)
        resp.raise_for_status()
        return TestConnectionResult(ok=True, message="MeTube joignable")
    except Exception as exc:
        return TestConnectionResult(ok=False, message=f"MeTube injoignable : {exc}")


@router.post("/test-navidrome", response_model=TestConnectionResult)
def test_navidrome(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    if not (settings.navidrome_url and settings.navidrome_username and settings.navidrome_password):
        return TestConnectionResult(ok=False, message="Identifiants Navidrome incomplets")

    ok, message = navidrome.ping(settings.navidrome_url, settings.navidrome_username, settings.navidrome_password)
    return TestConnectionResult(ok=ok, message=message)


@router.post("/test-email", response_model=TestConnectionResult)
def test_email(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    ok, message = notify.send_email(
        settings, "Test MusicReleasarr", "Ceci est un email de test de MusicReleasarr."
    )
    return TestConnectionResult(ok=ok, message=message)


@router.post("/test-pushbullet", response_model=TestConnectionResult)
def test_pushbullet(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    ok, message = notify.send_pushbullet(
        settings, "Test MusicReleasarr", "Ceci est une notification de test."
    )
    return TestConnectionResult(ok=ok, message=message)


@router.post("/run-scan", response_model=TestConnectionResult)
def run_scan_now():
    scheduler.run_full_cycle()
    return TestConnectionResult(ok=True, message="Scan execute")


def _require_lastfm_credentials(settings) -> None:
    if not settings.lastfm_api_key or not settings.lastfm_api_secret:
        raise HTTPException(422, "Renseigne la cle API et le secret Last.fm avant de te connecter")


@router.post("/lastfm-auth-start", response_model=LastfmAuthStartOut)
def lastfm_auth_start(db: Session = Depends(get_db)):
    """1ere etape du flux de connexion Last.fm (schema "desktop", sans URL de
    callback) : recupere un jeton temporaire et l'URL a ouvrir pour autoriser
    l'app - voir services/lastfm.py pour le detail du flux complet."""
    settings = scheduler.get_settings(db)
    _require_lastfm_credentials(settings)
    try:
        token = lastfm.get_auth_token(settings.lastfm_api_key, settings.lastfm_api_secret)
    except Exception as exc:
        raise HTTPException(502, f"Last.fm indisponible : {exc}") from exc
    return LastfmAuthStartOut(token=token, auth_url=lastfm.auth_url(settings.lastfm_api_key, token))


@router.post("/lastfm-auth-finish", response_model=SettingsOut)
def lastfm_auth_finish(payload: LastfmAuthFinishIn, db: Session = Depends(get_db)):
    """2e etape : une fois l'utilisateur revenu de la page d'autorisation
    Last.fm, echange le jeton contre une cle de session permanente."""
    settings = scheduler.get_settings(db)
    _require_lastfm_credentials(settings)
    try:
        session = lastfm.get_session(settings.lastfm_api_key, settings.lastfm_api_secret, payload.token)
    except Exception as exc:
        raise HTTPException(502, f"Autorisation Last.fm echouee (as-tu bien valide sur last.fm ?) : {exc}") from exc
    settings.lastfm_session_key = session.get("key")
    settings.lastfm_username = session.get("name")
    db.commit()
    db.refresh(settings)
    return settings


@router.post("/lastfm-disconnect", response_model=SettingsOut)
def lastfm_disconnect(db: Session = Depends(get_db)):
    settings = scheduler.get_settings(db)
    settings.lastfm_session_key = None
    settings.lastfm_username = None
    db.commit()
    db.refresh(settings)
    return settings
