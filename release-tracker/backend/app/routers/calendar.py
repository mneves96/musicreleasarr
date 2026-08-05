"""Flux ICS public (proteg par un token opaque dans l'URL, pas par cookie de
session) : les clients calendrier (Google Calendar, Apple Calendar, Outlook)
n'envoient ni cookie ni en-tete personnalise lorsqu'ils s'abonnent a une URL,
donc l'authentification par session ne peut pas s'appliquer ici. Toujours
regenere a la volee depuis la base actuelle - un client qui re-telecharge le
flux periodiquement voit donc les memes donnees que l'app."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from icalendar import Calendar, Event
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Release
from ..scheduler import get_settings

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/{token}.ics")
def ics_feed(token: str, db: Session = Depends(get_db)):
    settings = get_settings(db)
    if not settings.calendar_token or token != settings.calendar_token:
        raise HTTPException(404, "Lien calendrier invalide")

    cal = Calendar()
    cal.add("prodid", "-//MusicReleasarr//releases//FR")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", "MusicReleasarr")

    releases = (
        db.query(Release)
        .filter(Release.artist.has(is_followed=True), Release.release_date.isnot(None))
        .all()
    )
    for release in releases:
        event = Event()
        event.add("uid", f"release-{release.id}@musicreleasarr")
        event.add("summary", f"{release.artist.name} - {release.title}")
        event.add("description", release.release_type.value)
        event.add("dtstart", release.release_date)
        event.add("dtend", release.release_date + timedelta(days=1))
        event.add("dtstamp", date.today())
        cal.add_component(event)

    return Response(
        content=cal.to_ical(),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="musicreleasarr.ics"'},
    )
