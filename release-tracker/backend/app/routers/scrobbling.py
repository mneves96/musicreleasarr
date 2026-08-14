"""Stats de scrobbling agregees (Last.fm + ListenBrainz) pour le widget
"Scrobbling" du tableau de bord (voir DashboardPage.tsx) - chaque service est
independant, absent du resultat s'il n'est pas configure/connecte plutot que
de faire echouer toute la reponse."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import LastfmScrobbleStatsOut, ListenbrainzScrobbleStatsOut, ScrobblingStatsOut
from ..scheduler import get_settings
from ..services import lastfm, listenbrainz

router = APIRouter(prefix="/api/scrobbling", tags=["scrobbling"])


@router.get("/stats", response_model=ScrobblingStatsOut)
def stats(db: Session = Depends(get_db)):
    settings = get_settings(db)

    lastfm_stats = None
    if settings.lastfm_username and settings.lastfm_api_key:
        try:
            info = lastfm.get_user_info(settings.lastfm_username, settings.lastfm_api_key)
            if info:
                lastfm_stats = LastfmScrobbleStatsOut(
                    username=info.get("name") or settings.lastfm_username,
                    playcount=int(info.get("playcount") or 0),
                    url=info.get("url"),
                )
        except Exception:
            pass

    listenbrainz_stats = None
    if settings.listenbrainz_username:
        try:
            count = listenbrainz.get_listen_count(settings.listenbrainz_username)
            if count is not None:
                listenbrainz_stats = ListenbrainzScrobbleStatsOut(
                    username=settings.listenbrainz_username, listen_count=count
                )
        except Exception:
            pass

    return ScrobblingStatsOut(lastfm=lastfm_stats, listenbrainz=listenbrainz_stats)
