import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from .db import SessionLocal
from .enrichment import enrich_artist
from .matching import best_match, normalize_text
from .models import ALL_RELEASE_TYPES, Artist, DownloadStatus, OwnershipStatus, Release, ReleaseType, Settings
from .services import coverart, deezer, metube, musicbrainz, navidrome, notify, ytmusic

FAVORITE_MATCH_THRESHOLD = 0.85

logger = logging.getLogger("dedieufy.scheduler")

_scheduler = BackgroundScheduler()
FULL_CYCLE_JOB_ID = "full_discovery_cycle"
RECHECK_JOB_ID = "recheck_queued_downloads"


def get_settings(db: Session) -> Settings:
    settings = db.query(Settings).first()
    if settings is None:
        settings = Settings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def backfill_artist_metadata(db: Session) -> None:
    """Complete l'enrichissement (image, Deezer, Last.fm, YouTube Music) pour les
    artistes deja suivis auxquels il manque des informations, par exemple ceux
    suivis avant l'ajout du lien YouTube Music."""
    settings = get_settings(db)
    artists = db.query(Artist).filter(Artist.is_followed.is_(True)).all()
    for artist in artists:
        if artist.deezer_id and artist.image_url and artist.ytmusic_browse_id:
            continue
        try:
            enrich_artist(artist, settings.lastfm_api_key)
        except Exception:
            logger.exception("Echec de l'enrichissement pour %s", artist.name)
    db.commit()


def discover_new_releases(db: Session) -> None:
    artists = db.query(Artist).filter(Artist.is_followed.is_(True)).all()
    for artist in artists:
        try:
            _discover_for_artist(db, artist)
        except Exception:
            logger.exception("Echec de la decouverte de nouvelles sorties pour %s", artist.name)


def _discover_for_artist(db: Session, artist: Artist) -> None:
    # Nettoie les release-groups "poubelle" (bootlegs/broadcasts/demos) inserees
    # avant l'ajout du filtrage - elles ne seront de toute facon plus reinserees.
    db.query(Release).filter(
        Release.artist_id == artist.id, Release.release_type == ReleaseType.other
    ).delete()

    release_groups = musicbrainz.get_release_groups(artist.musicbrainz_id)

    candidates: list[tuple[dict, str]] = []
    for rg in release_groups:
        if db.query(Release).filter(Release.musicbrainz_id == rg["id"]).first():
            continue
        release_type = musicbrainz.classify_release_type(rg)
        if release_type is None:
            continue
        candidates.append((rg, release_type))

    if not candidates:
        db.commit()
        return

    deezer_albums = None
    if artist.deezer_id:
        try:
            deezer_albums = deezer.get_artist_albums(artist.deezer_id)
        except Exception:
            logger.warning("Deezer indisponible pour %s", artist.name)

    with ThreadPoolExecutor(max_workers=24) as pool:
        caa_covers = list(pool.map(lambda item: coverart.get_release_group_cover(item[0]["id"]), candidates))

    cutoff = (artist.created_at or datetime.utcnow()).date()

    for (rg, release_type), caa_cover in zip(candidates, caa_covers):
        release_date, precision = musicbrainz.parse_release_date(rg.get("first-release-date"))

        cover_url, deezer_id = caa_cover, None
        if deezer_albums:
            match = deezer.find_matching_album(deezer_albums, rg["title"])
            if match:
                deezer_id = str(match.get("id"))
                if not cover_url:
                    cover_url = match.get("cover_xl") or match.get("cover_big")

        # Les releases deja sorties avant que l'artiste soit suivi sont du "backlog" :
        # on les marque comme deja notifiees pour ne pas spammer, mais elles restent
        # eligibles au scan de possession et au telechargement automatique.
        is_backlog = release_date is None or release_date < cutoff

        release = Release(
            artist_id=artist.id,
            title=rg["title"],
            release_type=release_type,
            release_date=release_date,
            release_date_precision=precision,
            cover_url=cover_url,
            musicbrainz_id=rg["id"],
            deezer_id=deezer_id,
            notified_at=datetime.utcnow() if is_backlog else None,
        )
        db.add(release)
    db.commit()


def scan_ownership(db: Session, only_queued: bool = False, artist_id: int | None = None) -> None:
    settings = get_settings(db)
    if not (settings.navidrome_url and settings.navidrome_username and settings.navidrome_password):
        logger.info("Connexion Navidrome non configuree, scan de possession ignore")
        return

    query = db.query(Release)
    if artist_id is not None:
        query = query.filter(Release.artist_id == artist_id)
    if only_queued:
        query = query.filter(Release.download_status == DownloadStatus.queued)
    else:
        query = query.filter(Release.ownership_status == OwnershipStatus.unknown)

    for release in query.all():
        artist = release.artist
        try:
            owned = navidrome.album_exists(
                settings.navidrome_url,
                settings.navidrome_username,
                settings.navidrome_password,
                artist.name,
                release.title,
            )
        except Exception:
            logger.exception("Echec du scan Navidrome pour %s - %s", artist.name, release.title)
            continue

        if owned:
            release.ownership_status = OwnershipStatus.owned
            if release.download_status == DownloadStatus.queued:
                release.download_status = DownloadStatus.downloaded
        elif not only_queued:
            release.ownership_status = OwnershipStatus.missing
    db.commit()


def process_pending(db: Session, artist_id: int | None = None) -> None:
    settings = get_settings(db)

    download_query = db.query(Release).filter(
        Release.ownership_status == OwnershipStatus.missing,
        Release.download_status == DownloadStatus.not_requested,
    )
    if artist_id is not None:
        download_query = download_query.filter(Release.artist_id == artist_id)

    for release in download_query.all():
        artist = release.artist
        if not artist.is_followed or not artist.auto_download:
            continue
        if release.release_type.value not in (artist.followed_release_types or []):
            continue
        _trigger_download(db, settings, artist, release)

    notify_query = db.query(Release).filter(
        Release.ownership_status != OwnershipStatus.unknown,
        Release.notified_at.is_(None),
    )
    if artist_id is not None:
        notify_query = notify_query.filter(Release.artist_id == artist_id)

    for release in notify_query.all():
        artist = release.artist
        if artist.is_followed and artist.notify_enabled:
            type_followed = release.release_type.value in (artist.followed_release_types or [])
            if type_followed:
                notify.notify_new_release(settings, artist, release)
        release.notified_at = datetime.utcnow()

    db.commit()


def _trigger_download(db: Session, settings: Settings, artist: Artist, release: Release) -> None:
    if not settings.metube_url:
        logger.info("MeTube non configure, telechargement de %s ignore", release.title)
        return
    try:
        track_ids: list[str] = []
        if not release.youtube_music_url:
            browse_id = ytmusic.search_release_browse_id(artist.name, release.title)
            if not browse_id:
                logger.warning("Aucun resultat YouTube Music pour %s - %s", artist.name, release.title)
                return
            details = ytmusic.get_release_details(browse_id)
            if details["playlist_url"]:
                release.youtube_music_url = details["playlist_url"]
            else:
                track_ids = [t["video_id"] for t in details["tracks"]]

        if not release.youtube_music_url and not track_ids:
            logger.warning("Aucune piste trouvee sur YouTube Music pour %s - %s", artist.name, release.title)
            return

        ok, message = metube.queue_release(
            settings.metube_url, normalize_text(artist.name), release.youtube_music_url, track_ids
        )
        release.download_status = DownloadStatus.queued if ok else DownloadStatus.failed
        if not ok:
            logger.warning("Echec MeTube pour %s - %s : %s", artist.name, release.title, message)
    except Exception:
        logger.exception("Echec du declenchement de telechargement pour %s - %s", artist.name, release.title)
        release.download_status = DownloadStatus.failed


def scan_artist(db: Session, artist: Artist) -> None:
    """Scan cible sur un seul artiste : utilise a la fois quand on suit un nouvel
    artiste et par le bouton "Actualiser" de la page artiste."""
    if not (artist.deezer_id and artist.image_url and artist.ytmusic_browse_id and artist.country):
        try:
            settings = get_settings(db)
            enrich_artist(artist, settings.lastfm_api_key)
            db.commit()
        except Exception:
            logger.exception("Echec de l'enrichissement pour %s", artist.name)

    _discover_for_artist(db, artist)
    scan_ownership(db, only_queued=False, artist_id=artist.id)
    process_pending(db, artist_id=artist.id)


def import_navidrome_favorite_artists(names: list[str]) -> None:
    """Tache de fond (voir routers/artists.py:import_favorites) : pour chaque nom
    d'artiste favori Navidrome, cherche la correspondance MusicBrainz, le suit
    avec les reglages par defaut (notifications oui, telechargement auto non) et
    lance un scan complet. Les echecs individuels n'interrompent pas le lot."""
    with SessionLocal() as db:
        settings = get_settings(db)
        for name in names:
            try:
                _import_favorite_artist(db, name, settings)
            except Exception:
                logger.exception("Echec de l'import du favori Navidrome '%s'", name)


def _import_favorite_artist(db: Session, name: str, settings: Settings) -> None:
    results = musicbrainz.search_artists(name, limit=5)
    if not results:
        logger.info("Aucun resultat MusicBrainz pour le favori Navidrome '%s'", name)
        return

    idx = best_match(name, [r["name"] for r in results], threshold=FAVORITE_MATCH_THRESHOLD)
    if idx is None:
        logger.info("Aucune correspondance suffisamment fiable pour le favori Navidrome '%s'", name)
        return
    mb_artist = results[idx]

    artist = db.query(Artist).filter(Artist.musicbrainz_id == mb_artist["id"]).first()
    already_followed = artist is not None and artist.is_followed

    if artist is None:
        artist = Artist(name=mb_artist["name"], musicbrainz_id=mb_artist["id"])
        enrich_artist(artist, settings.lastfm_api_key)
        db.add(artist)
        db.commit()
        db.refresh(artist)

    if not already_followed:
        artist.is_followed = True
        artist.notify_enabled = True
        artist.auto_download = False
        artist.followed_release_types = list(ALL_RELEASE_TYPES)
        db.commit()

    scan_artist(db, artist)


def run_full_cycle() -> None:
    with SessionLocal() as db:
        backfill_artist_metadata(db)
        discover_new_releases(db)
        scan_ownership(db, only_queued=False)
        process_pending(db)


def run_recheck_queued() -> None:
    with SessionLocal() as db:
        scan_ownership(db, only_queued=True)


def reschedule() -> None:
    with SessionLocal() as db:
        settings = get_settings(db)
        cron = settings.scan_cron

    _scheduler.add_job(
        run_full_cycle,
        trigger=CronTrigger.from_crontab(cron),
        id=FULL_CYCLE_JOB_ID,
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )


def start_scheduler() -> None:
    reschedule()
    _scheduler.add_job(
        run_recheck_queued,
        trigger=IntervalTrigger(hours=1),
        id=RECHECK_JOB_ID,
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=1800,
    )
    if not _scheduler.running:
        _scheduler.start()


def shutdown_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
