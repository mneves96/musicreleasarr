import enum
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class ReleaseType(str, enum.Enum):
    album = "album"
    ep = "ep"
    single = "single"
    compilation = "compilation"
    other = "other"


class DatePrecision(str, enum.Enum):
    day = "day"
    month = "month"
    year = "year"


class OwnershipStatus(str, enum.Enum):
    unknown = "unknown"
    owned = "owned"
    missing = "missing"


class DownloadStatus(str, enum.Enum):
    not_requested = "not_requested"
    queued = "queued"
    downloaded = "downloaded"
    failed = "failed"


class TaggingStatus(str, enum.Enum):
    needs_review = "needs_review"
    done = "done"
    error = "error"


ALL_RELEASE_TYPES = [t.value for t in ReleaseType]


class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)

    musicbrainz_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    deezer_id: Mapped[str | None] = mapped_column(String, nullable=True)
    lastfm_url: Mapped[str | None] = mapped_column(String, nullable=True)
    spotify_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ytmusic_browse_id: Mapped[str | None] = mapped_column(String, nullable=True)

    country: Mapped[str | None] = mapped_column(String, nullable=True)
    area_name: Mapped[str | None] = mapped_column(String, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_followed: Mapped[bool] = mapped_column(Boolean, default=False)
    # False par defaut : un artiste juste previsualise (pas encore suivi) ne doit
    # pas apparaitre avec les notifications deja activees. Suivre un artiste passe
    # explicitement par cette valeur (voir routers/artists.py:follow_artist).
    notify_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_download: Mapped[bool] = mapped_column(Boolean, default=False)
    followed_release_types: Mapped[list[str]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    releases: Mapped[list["Release"]] = relationship(
        back_populates="artist", cascade="all, delete-orphan", order_by="desc(Release.release_date)"
    )

    @property
    def ytmusic_url(self) -> str | None:
        return f"https://music.youtube.com/channel/{self.ytmusic_browse_id}" if self.ytmusic_browse_id else None

    @property
    def album_count(self) -> int:
        return sum(1 for r in self.releases if r.release_type == ReleaseType.album)

    @property
    def release_count(self) -> int:
        return len(self.releases)

    @property
    def latest_release_date(self) -> date | None:
        dated = [r.release_date for r in self.releases if r.release_date]
        return max(dated) if dated else None


class Release(Base):
    __tablename__ = "releases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id"), index=True)

    title: Mapped[str] = mapped_column(String)
    release_type: Mapped[ReleaseType] = mapped_column(Enum(ReleaseType), default=ReleaseType.other)
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    release_date_precision: Mapped[DatePrecision | None] = mapped_column(
        Enum(DatePrecision), nullable=True
    )
    cover_url: Mapped[str | None] = mapped_column(String, nullable=True)

    musicbrainz_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    deezer_id: Mapped[str | None] = mapped_column(String, nullable=True)
    lastfm_url: Mapped[str | None] = mapped_column(String, nullable=True)
    spotify_id: Mapped[str | None] = mapped_column(String, nullable=True)
    youtube_music_url: Mapped[str | None] = mapped_column(String, nullable=True)

    ownership_status: Mapped[OwnershipStatus] = mapped_column(
        Enum(OwnershipStatus), default=OwnershipStatus.unknown
    )
    download_status: Mapped[DownloadStatus] = mapped_column(
        Enum(DownloadStatus), default=DownloadStatus.not_requested
    )
    download_progress: Mapped[int | None] = mapped_column(Integer, nullable=True)
    download_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    artist: Mapped["Artist"] = relationship(back_populates="releases")

    @property
    def artist_name(self) -> str:
        return self.artist.name

    @property
    def artist_image_url(self) -> str | None:
        return self.artist.image_url


class TaggingItem(Base):
    """Backlog "a redresser" : un fichier audio depose par MeTube, en attente de
    correction des tags et de rangement vers <Artiste>/<Album>. Rien n'est ecrit
    ni deplace tant qu'un humain n'a pas confirme la correspondance proposee
    (voir routers/tagging.py) - une premiere version 100% automatique produisait
    des doublons d'album lies a des tags incoherents entre pistes."""

    __tablename__ = "tagging_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    release_id: Mapped[int] = mapped_column(ForeignKey("releases.id"), index=True)

    # Chemin absolu cote conteneur "releases" : sert de cle de deduplication au scan.
    source_path: Mapped[str] = mapped_column(String, unique=True)
    original_filename: Mapped[str] = mapped_column(String)

    status: Mapped[TaggingStatus] = mapped_column(Enum(TaggingStatus), default=TaggingStatus.needs_review)

    suggested_track_title: Mapped[str | None] = mapped_column(String, nullable=True)
    suggested_track_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggested_disc_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    target_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    release: Mapped["Release"] = relationship()

    @property
    def artist_name(self) -> str:
        return self.release.artist.name

    @property
    def release_title(self) -> str:
        return self.release.title


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    metube_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # URL jointe depuis le navigateur (peut differer de metube_url, qui est l'URL
    # interne au reseau Docker utilisee par le backend pour parler a MeTube).
    metube_public_url: Mapped[str | None] = mapped_column(String, nullable=True)

    navidrome_url: Mapped[str | None] = mapped_column(String, nullable=True)
    navidrome_username: Mapped[str | None] = mapped_column(String, nullable=True)
    navidrome_password: Mapped[str | None] = mapped_column(String, nullable=True)

    lastfm_api_key: Mapped[str | None] = mapped_column(String, nullable=True)

    smtp_host: Mapped[str | None] = mapped_column(String, nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_user: Mapped[str | None] = mapped_column(String, nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(String, nullable=True)
    smtp_from: Mapped[str | None] = mapped_column(String, nullable=True)
    smtp_to: Mapped[str | None] = mapped_column(String, nullable=True)
    notify_email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    pushbullet_token: Mapped[str | None] = mapped_column(String, nullable=True)
    notify_pushbullet_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    scan_cron: Mapped[str] = mapped_column(String, default="0 6 * * *")

    calendar_token: Mapped[str | None] = mapped_column(String, nullable=True)

    # Chemins (cote conteneur "releases") utilises par le pipeline de redressage
    # metadata post-telechargement : ou scanner les fichiers deposes par MeTube,
    # et ou ranger la bibliotheque une fois les tags corriges.
    tagging_downloads_path: Mapped[str] = mapped_column(String, default="/music/youtube")
    tagging_library_path: Mapped[str] = mapped_column(String, default="/music")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AppUser(Base):
    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
