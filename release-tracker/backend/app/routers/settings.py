import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from .. import scheduler
from ..schemas import SettingsOut, SettingsUpdateIn, TestConnectionResult
from ..services import navidrome, notify

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return scheduler.get_settings(db)


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
