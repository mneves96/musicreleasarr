from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from .models import DownloadStatus, OwnershipStatus, ReleaseType, TaggingStatus


class ArtistSearchResult(BaseModel):
    musicbrainz_id: str
    name: str
    disambiguation: str | None = None
    image_url: str | None = None
    already_followed: bool = False
    country: str | None = None
    area_name: str | None = None
    artist_type: str | None = None


class ArtistSearchPage(BaseModel):
    results: list[ArtistSearchResult]
    total: int
    offset: int
    limit: int


class ReleaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: int
    artist_name: str
    artist_image_url: str | None = None
    title: str
    release_type: ReleaseType
    release_date: date | None
    cover_url: str | None
    musicbrainz_id: str
    deezer_id: str | None
    lastfm_url: str | None
    spotify_id: str | None
    youtube_music_url: str | None
    ownership_status: OwnershipStatus
    download_status: DownloadStatus
    download_error: str | None
    notified_at: datetime | None


class ArtistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    image_url: str | None
    musicbrainz_id: str
    deezer_id: str | None
    lastfm_url: str | None
    spotify_id: str | None
    ytmusic_url: str | None
    country: str | None
    area_name: str | None
    bio: str | None
    album_count: int
    release_count: int
    latest_release_date: date | None
    is_followed: bool
    notify_enabled: bool
    auto_download: bool
    followed_release_types: list[str]


class ArtistWithReleases(ArtistOut):
    releases: list[ReleaseOut] = []


class FollowArtistIn(BaseModel):
    musicbrainz_id: str
    notify_enabled: bool = True
    auto_download: bool = False
    followed_release_types: list[str] = []


class ArtistUpdateIn(BaseModel):
    is_followed: bool | None = None
    notify_enabled: bool | None = None
    auto_download: bool | None = None
    followed_release_types: list[str] | None = None


class TrackOut(BaseModel):
    title: str
    video_id: str
    duration: str | None = None
    owned: bool | None = None


class TrackChoice(BaseModel):
    title: str
    position: int
    disc_number: int
    recording_id: str | None = None
    release_mbid: str | None = None


class TaggingItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    release_id: int | None
    artist_name: str | None
    release_title: str | None
    source_folder: str
    source_path: str
    original_filename: str
    status: TaggingStatus
    suggested_track_title: str | None
    suggested_track_number: int | None
    suggested_disc_number: int | None
    match_score: float | None
    target_path: str | None
    error_message: str | None
    created_at: datetime


class TaggingConfirmIn(BaseModel):
    track_title: str
    track_number: int | None = None
    disc_number: int | None = None
    recording_id: str | None = None
    release_mbid: str | None = None


class ReleaseGroupChoice(BaseModel):
    musicbrainz_id: str
    title: str
    release_type: ReleaseType
    release_date: date | None = None


class TaggingIdentifyIn(BaseModel):
    source_folder: str
    artist_musicbrainz_id: str
    artist_name: str
    release_group_musicbrainz_id: str
    release_title: str
    release_type: ReleaseType
    release_date: date | None = None


class TaggingAutoMatchIn(BaseModel):
    source_folder: str


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    metube_url: str | None
    metube_public_url: str | None
    navidrome_url: str | None
    navidrome_username: str | None
    navidrome_password: str | None
    lastfm_api_key: str | None
    smtp_host: str | None
    smtp_port: int | None
    smtp_user: str | None
    smtp_password: str | None
    smtp_from: str | None
    smtp_to: str | None
    notify_email_enabled: bool
    pushbullet_token: str | None
    notify_pushbullet_enabled: bool
    scan_cron: str
    calendar_token: str | None
    tagging_downloads_path: str
    tagging_library_path: str


class SettingsUpdateIn(BaseModel):
    metube_url: str | None = None
    metube_public_url: str | None = None
    navidrome_url: str | None = None
    navidrome_username: str | None = None
    navidrome_password: str | None = None
    lastfm_api_key: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_to: str | None = None
    notify_email_enabled: bool | None = None
    pushbullet_token: str | None = None
    notify_pushbullet_enabled: bool | None = None
    scan_cron: str | None = None
    tagging_downloads_path: str | None = None
    tagging_library_path: str | None = None


class TestConnectionResult(BaseModel):
    ok: bool
    message: str
