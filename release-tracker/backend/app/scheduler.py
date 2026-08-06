import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from .db import SessionLocal
from .enrichment import enrich_artist, get_or_create_artist
from .matching import best_match, normalize_text
from .models import ALL_RELEASE_TYPES, Artist, DownloadStatus, OwnershipStatus, Release, ReleaseType, Settings
from .services import coverart, deezer, lastfm, metube, musicbrainz, navidrome, notify, tagging, ytmusic

FAVORITE_MATCH_THRESHOLD = 0.85
# MusicBrainz limite a 1 requete/seconde : resoudre un mbid manquant pour
# chaque recommandation pourrait faire trainer le job plusieurs minutes si
# beaucoup d'entre elles n'en ont pas (artistes peu connus) - on borne le
# nombre de resolutions tentees par rafraichissement plutot que de laisser le
# job trainer indefiniment, quitte a laisser de cote quelques recommandations
# obscures (elles seront retentees au prochain rafraichissement nocturne).
MAX_RECOMMENDATION_MBID_RESOLUTIONS = 8

logger = logging.getLogger("dedieufy.scheduler")

_scheduler = BackgroundScheduler()
FULL_CYCLE_JOB_ID = "full_discovery_cycle"
RECHECK_JOB_ID = "recheck_queued_downloads"
DOWNLOAD_STATUS_JOB_ID = "refresh_download_statuses"
TAGGING_SCAN_JOB_ID = "scan_tagging_backlog"
LASTFM_RECOMMENDATIONS_JOB_ID = "refresh_lastfm_recommendations"


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
        # Inclut aussi "downloaded" (deja confirme cote MeTube via refresh_download_statuses)
        # tant que Navidrome n'a pas encore indexe le fichier - sinon on ne le revererait jamais.
        query = query.filter(
            Release.download_status.in_([DownloadStatus.queued, DownloadStatus.downloaded]),
            Release.ownership_status != OwnershipStatus.owned,
        )
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

    # Notifier des la sortie reelle, pas des la decouverte : MusicBrainz liste souvent
    # une release des son annonce, parfois des mois avant, avec une release_date future.
    # On attend que cette date soit atteinte pour notifier - et on ne conditionne plus
    # ca au scan de possession Navidrome (une release peut n'avoir jamais ete notifiee
    # si Navidrome n'etait pas configure, puisque ownership_status restait "unknown"
    # indefiniment et bloquait l'eligibilite a la notification).
    today = date.today()
    notify_query = db.query(Release).filter(
        Release.notified_at.is_(None),
        (Release.release_date.is_(None)) | (Release.release_date <= today),
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
        if not release.youtube_music_url:
            browse_id = ytmusic.resolve_release_browse_id(artist.name, release.title, artist.ytmusic_browse_id)
            if not browse_id:
                logger.warning("Aucun resultat YouTube Music pour %s - %s", artist.name, release.title)
                return
            release.youtube_music_url = ytmusic.album_url(browse_id)

        ok, message = metube.queue_download(
            settings.metube_url, release.youtube_music_url, folder=normalize_text(artist.name)
        )
        release.download_status = DownloadStatus.queued if ok else DownloadStatus.failed
        release.download_error = None if ok else message
        if not ok:
            logger.warning("Echec MeTube pour %s - %s : %s", artist.name, release.title, message)
    except Exception:
        logger.exception("Echec du declenchement de telechargement pour %s - %s", artist.name, release.title)
        release.download_status = DownloadStatus.failed


def refresh_download_statuses(db: Session) -> None:
    """Interroge MeTube pour savoir ou en sont les telechargements "queued" :
    MeTube telecharge en arriere-plan, /add ne fait qu'accepter la demande, donc
    sans ca le statut restait bloque sur "queued" indefiniment meme en cas
    d'echec cote MeTube (video indisponible, region-locked, etc.)."""
    settings = get_settings(db)
    if not settings.metube_url:
        return

    releases = (
        db.query(Release)
        .filter(Release.download_status == DownloadStatus.queued)
        .filter(Release.youtube_music_url.isnot(None))
        .all()
    )
    if not releases:
        return

    try:
        history = metube.get_history(settings.metube_url)
    except Exception:
        logger.exception("Impossible de recuperer l'historique MeTube")
        return

    done_by_url = {item["url"]: item for item in history.get("done") or [] if item.get("url")}
    queue_by_url = {item["url"]: item for item in history.get("queue") or [] if item.get("url")}
    pending_urls = {item["url"] for item in history.get("pending") or [] if item.get("url")}

    for release in releases:
        url = release.youtube_music_url
        if url in done_by_url:
            info = done_by_url[url]
            if info.get("status") == "error":
                release.download_status = DownloadStatus.failed
                release.download_error = info.get("msg") or info.get("error") or "Echec du telechargement MeTube"
            else:
                release.download_status = DownloadStatus.downloaded
                release.download_error = None
        elif url in queue_by_url:
            pass  # toujours en cours cote MeTube, rien a changer
        elif url in pending_urls:
            pass  # toujours en attente de demarrage cote MeTube, rien a changer
        else:
            # Ni dans "done", ni "queue", ni "pending" : MeTube ne connait plus cette
            # URL (suppression manuelle depuis l'onglet MeTube, redemarrage de
            # MeTube qui a perdu son historique, ou telechargement d'un album dont
            # yt-dlp a eclate le contenu en pistes individuelles ne correspondant
            # plus exactement a l'URL "album" envoyee a l'origine). Laisser le
            # statut bloque sur "queued" empechait toute nouvelle tentative (le
            # bouton Telecharger reste cache tant que le statut est "queued") -
            # on bascule donc en echec explicite plutot que de rester bloque en
            # silence ; le statut de possession reel (via Navidrome) reste inchange
            # et prevaudra visuellement si le fichier est en realite bien present.
            release.download_status = DownloadStatus.failed
            release.download_error = (
                "Introuvable dans l'historique MeTube (supprime manuellement ou MeTube redemarre) - "
                "relance le telechargement si la release n'est pas dans ta bibliotheque."
            )
    db.commit()


def scan_tagging_backlog(db: Session) -> None:
    """Detecte tout fichier audio nouveau sous le dossier de telechargements -
    comme Picard, sans condition sur l'origine du telechargement ni sur le
    statut d'une release cote app (voir services/tagging.py:scan_downloads_root).
    N'ecrit ni ne deplace jamais de fichier."""
    settings = get_settings(db)
    try:
        tagging.scan_downloads_root(db, settings)
    except Exception:
        logger.exception("Echec du scan de redressage metadata")


def refresh_lastfm_recommendations(db: Session) -> None:
    """Rafraichissement nocturne des recommandations Last.fm (voir POST
    /api/artists/recommended/refresh pour le declenchement manuel) : supprime
    les recommandations precedentes non suivies puis en reimporte de
    nouvelles, stockees comme de vrais Artist (is_recommended=True) - meme
    table que les artistes suivis, pour que l'onglet Recommandations
    reutilise telle quelle l'UI/le code de l'onglet Suivis (meme composants
    ArtistCard/ArtistListRow, meme fiche artiste pour les parametres de
    suivi). Base sur les artistes reellement suivis dans l'app (pas
    l'historique d'ecoute Last.fm) : chaque recommandation garde la trace du
    ou des artiste(s) suivi(s) qui l'ont fait remonter (recommended_because,
    affiche cote frontend "Base sur : ...")."""
    settings = get_settings(db)
    if not (settings.lastfm_api_key and settings.lastfm_api_secret and settings.lastfm_session_key):
        logger.info("Last.fm non connecte, rafraichissement des recommandations ignore")
        return

    followed = db.query(Artist).filter(Artist.is_followed.is_(True)).all()
    if not followed:
        logger.info("Aucun artiste suivi, rafraichissement des recommandations Last.fm ignore")
        return

    try:
        raw = lastfm.get_similar_to_followed(
            [(a.id, a.name) for a in followed], settings.lastfm_api_key
        )
    except Exception:
        logger.exception("Echec de la recuperation des recommandations Last.fm")
        return

    # Un artiste suivi ne doit jamais etre supprime, meme s'il ressort comme
    # similaire a un autre artiste suivi - is_recommended reste False pour lui
    # plus bas (le check `if artist.is_followed: continue` avant de le marquer).
    stale = db.query(Artist).filter(Artist.is_recommended.is_(True), Artist.is_followed.is_(False)).all()
    for artist in stale:
        db.delete(artist)
    db.commit()

    followed_ids = {a.musicbrainz_id for a in followed}
    resolutions_used = 0

    for item in raw:
        name = item.get("name")
        if not name:
            continue

        mbid = item.get("mbid") or None
        if not mbid:
            if resolutions_used >= MAX_RECOMMENDATION_MBID_RESOLUTIONS:
                continue
            resolutions_used += 1
            # Last.fm ne fournit pas toujours un mbid (artiste peu connu) - meme
            # logique de repli que l'import des favoris Navidrome ci-dessous.
            try:
                candidates, _total = musicbrainz.search_artists(name, limit=5)
            except Exception:
                continue
            idx = best_match(name, [c["name"] for c in candidates], threshold=FAVORITE_MATCH_THRESHOLD)
            if idx is None:
                continue
            mbid = candidates[idx]["id"]

        # Filtre de securite en plus de l'exclusion par nom faite cote
        # lastfm.get_similar_to_followed : le mbid est la source de verite,
        # fiable meme si Last.fm renvoie un nom legerement different (alias,
        # feat., ponctuation...) de celui suivi dans l'app.
        if mbid in followed_ids:
            continue

        try:
            artist = get_or_create_artist(db, mbid, settings.lastfm_api_key)
        except Exception:
            logger.warning("Impossible de creer l'artiste recommande '%s'", name)
            continue

        if artist.is_followed:
            continue

        artist.is_recommended = True
        artist.recommended_because = [
            {"id": s["id"], "name": s["name"]} for s in item.get("sources", [])[:3]
        ]

    db.commit()


def _backfill_youtube_links(db: Session, artist: Artist) -> None:
    """Repare les releases deja telechargees (ou en cours/en echec) auxquelles il
    manque le lien YouTube Music - un ancien mecanisme de repli piste par piste
    telechargeait bien la release sans jamais sauvegarder ce lien, laissant le
    bouton YouTube Music grise malgre un telechargement reussi."""
    releases = (
        db.query(Release)
        .filter(
            Release.artist_id == artist.id,
            Release.youtube_music_url.is_(None),
            Release.download_status != DownloadStatus.not_requested,
        )
        .all()
    )
    for release in releases:
        try:
            browse_id = ytmusic.resolve_release_browse_id(
                artist.name, release.title, artist.ytmusic_browse_id
            )
            if browse_id:
                release.youtube_music_url = ytmusic.album_url(browse_id)
        except Exception:
            logger.warning("Repli lien YouTube Music echoue pour %s - %s", artist.name, release.title)
    if releases:
        db.commit()


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
    _backfill_youtube_links(db, artist)


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
    results, _total = musicbrainz.search_artists(name, limit=5)
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


def run_refresh_download_statuses() -> None:
    with SessionLocal() as db:
        refresh_download_statuses(db)


def run_scan_tagging_backlog() -> None:
    with SessionLocal() as db:
        scan_tagging_backlog(db)


def run_refresh_lastfm_recommendations() -> None:
    with SessionLocal() as db:
        refresh_lastfm_recommendations(db)


def reschedule() -> None:
    with SessionLocal() as db:
        settings = get_settings(db)
        cron = settings.scan_cron
        lastfm_cron = settings.lastfm_recommendations_cron

    _scheduler.add_job(
        run_full_cycle,
        trigger=CronTrigger.from_crontab(cron),
        id=FULL_CYCLE_JOB_ID,
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    _scheduler.add_job(
        run_refresh_lastfm_recommendations,
        trigger=CronTrigger.from_crontab(lastfm_cron),
        id=LASTFM_RECOMMENDATIONS_JOB_ID,
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
    _scheduler.add_job(
        run_refresh_download_statuses,
        trigger=IntervalTrigger(minutes=2),
        id=DOWNLOAD_STATUS_JOB_ID,
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=120,
    )
    _scheduler.add_job(
        run_scan_tagging_backlog,
        trigger=IntervalTrigger(minutes=5),
        id=TAGGING_SCAN_JOB_ID,
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        # Lance un premier scan tout de suite au demarrage plutot que d'attendre
        # 5 min : sinon un redemarrage/redeploiement laisse le backlog vide en
        # apparence jusqu'a la premiere execution planifiee.
        next_run_time=datetime.utcnow(),
    )
    if not _scheduler.running:
        _scheduler.start()


def shutdown_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
