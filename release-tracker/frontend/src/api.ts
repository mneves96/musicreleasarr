export type ReleaseType = 'album' | 'ep' | 'single' | 'compilation' | 'other'
export type OwnershipStatus = 'unknown' | 'owned' | 'missing'
export type DownloadStatus = 'not_requested' | 'queued' | 'downloaded' | 'failed'

export interface ArtistSearchResult {
  musicbrainz_id: string
  name: string
  disambiguation: string | null
  image_url: string | null
  already_followed: boolean
  country: string | null
  area_name: string | null
  artist_type: string | null
}

export interface ArtistSearchPage {
  results: ArtistSearchResult[]
  total: number
  offset: number
  limit: number
}

export interface ArtistSearchFilters {
  country?: string
  type?: string
  tag?: string
}

export interface Artist {
  id: number
  name: string
  image_url: string | null
  musicbrainz_id: string
  deezer_id: string | null
  lastfm_url: string | null
  spotify_id: string | null
  ytmusic_url: string | null
  country: string | null
  area_name: string | null
  bio: string | null
  album_count: number
  release_count: number
  latest_release_date: string | null
  is_followed: boolean
  notify_enabled: boolean
  auto_download: boolean
  followed_release_types: ReleaseType[]
}

export interface Release {
  id: number
  artist_id: number
  artist_name: string
  artist_image_url: string | null
  title: string
  release_type: ReleaseType
  release_date: string | null
  cover_url: string | null
  musicbrainz_id: string
  deezer_id: string | null
  lastfm_url: string | null
  spotify_id: string | null
  youtube_music_url: string | null
  ownership_status: OwnershipStatus
  download_status: DownloadStatus
  download_error: string | null
  notified_at: string | null
}

export interface ArtistWithReleases extends Artist {
  releases: Release[]
}

export interface Track {
  title: string
  video_id: string
  duration: string | null
  owned: boolean | null
}

export type TaggingStatus = 'needs_review' | 'done' | 'error'

export interface TaggingItem {
  id: number
  release_id: number | null
  artist_name: string | null
  release_title: string | null
  source_folder: string
  source_path: string
  original_filename: string
  status: TaggingStatus
  suggested_track_title: string | null
  suggested_track_number: number | null
  suggested_disc_number: number | null
  match_score: number | null
  target_path: string | null
  error_message: string | null
  created_at: string
}

export interface TrackChoice {
  title: string
  position: number
  disc_number: number
  recording_id: string | null
}

export interface TaggingConfirmPayload {
  track_title: string
  track_number?: number | null
  disc_number?: number | null
  recording_id?: string | null
}

export interface ReleaseGroupChoice {
  musicbrainz_id: string
  title: string
  release_type: ReleaseType
  release_date: string | null
}

export interface TaggingIdentifyPayload {
  source_folder: string
  artist_musicbrainz_id: string
  artist_name: string
  release_group_musicbrainz_id: string
  release_title: string
  release_type: ReleaseType
  release_date?: string | null
}

export interface Settings {
  metube_url: string | null
  metube_public_url: string | null
  navidrome_url: string | null
  navidrome_username: string | null
  navidrome_password: string | null
  lastfm_api_key: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_password: string | null
  smtp_from: string | null
  smtp_to: string | null
  notify_email_enabled: boolean
  pushbullet_token: string | null
  notify_pushbullet_enabled: boolean
  scan_cron: string
  calendar_token: string | null
  tagging_downloads_path: string
  tagging_library_path: string
}

export interface AuthStatus {
  needs_setup: boolean
  authenticated: boolean
  username: string | null
}

export interface TestConnectionResult {
  ok: boolean
  message: string
}

export type MetubeStatus = 'pending' | 'preparing' | 'downloading' | 'finished' | 'error' | 'scheduled'

export interface MetubeItem {
  id: string
  title: string | null
  url: string
  status: MetubeStatus
  percent: number | null
  speed: number | null
  eta: number | null
  size: number | null
  msg: string | null
  error: string | null
  filename: string | null
  quality: string | null
  format: string | null
  download_type: string | null
  folder: string | null
}

export interface MetubeHistory {
  queue: MetubeItem[]
  pending: MetubeItem[]
  done: MetubeItem[]
}

export interface MetubeAddPayload {
  url: string
  download_type: 'video' | 'audio' | 'captions' | 'thumbnail'
  quality: string
  format?: string
  folder?: string
  custom_name_prefix?: string
  auto_start?: boolean
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (resp.status === 401) {
    // La session a expire ou a ete invalidee (changement de mot de passe sur un
    // autre onglet, etc.) - previent AuthGate pour qu'il reaffiche l'ecran de
    // connexion, plutot que de laisser chaque page geter un 401 individuellement.
    window.dispatchEvent(new Event('auth:unauthorized'))
  }
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`${resp.status} ${resp.statusText} : ${body}`)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

const SEARCH_PAGE_SIZE = 20

export const api = {
  searchArtists: (q: string, offset = 0, filters: ArtistSearchFilters = {}) => {
    const params = new URLSearchParams({ q, offset: String(offset), limit: String(SEARCH_PAGE_SIZE) })
    if (filters.country) params.set('country', filters.country)
    if (filters.type) params.set('type', filters.type)
    if (filters.tag) params.set('tag', filters.tag)
    return request<ArtistSearchPage>(`/search/artists?${params.toString()}`)
  },

  listFollowedArtists: () => request<Artist[]>('/artists'),

  followArtist: (payload: {
    musicbrainz_id: string
    notify_enabled: boolean
    auto_download: boolean
    followed_release_types: ReleaseType[]
  }) => request<Artist>('/artists', { method: 'POST', body: JSON.stringify(payload) }),

  getArtist: (id: number) => request<ArtistWithReleases>(`/artists/${id}`),

  previewArtist: (musicbrainz_id: string) =>
    request<Artist>('/artists/preview', { method: 'POST', body: JSON.stringify({ musicbrainz_id }) }),

  updateArtist: (id: number, payload: Partial<Pick<Artist, 'is_followed' | 'notify_enabled' | 'auto_download' | 'followed_release_types'>>) =>
    request<Artist>(`/artists/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  scanArtist: (id: number) => request<TestConnectionResult>(`/artists/${id}/scan`, { method: 'POST' }),

  importFavorites: () => request<TestConnectionResult>('/artists/import-favorites', { method: 'POST' }),

  listReleases: (from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    return request<Release[]>(`/releases${qs ? `?${qs}` : ''}`)
  },

  downloadRelease: (id: number) =>
    request<TestConnectionResult>(`/releases/${id}/download`, { method: 'POST' }),

  listTracks: (releaseId: number) => request<Track[]>(`/releases/${releaseId}/tracks`),

  downloadTrack: (releaseId: number, videoId: string) =>
    request<TestConnectionResult>(`/releases/${releaseId}/tracks/${videoId}/download`, {
      method: 'POST',
    }),

  getSettings: () => request<Settings>('/settings'),

  updateSettings: (payload: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  testMetube: () => request<TestConnectionResult>('/settings/test-metube', { method: 'POST' }),
  testNavidrome: () => request<TestConnectionResult>('/settings/test-navidrome', { method: 'POST' }),
  testEmail: () => request<TestConnectionResult>('/settings/test-email', { method: 'POST' }),
  testPushbullet: () => request<TestConnectionResult>('/settings/test-pushbullet', { method: 'POST' }),
  runScanNow: () => request<TestConnectionResult>('/settings/run-scan', { method: 'POST' }),

  metubeHistory: () => request<MetubeHistory>('/metube/history'),
  metubePresets: () => request<{ presets: string[] }>('/metube/presets'),
  metubeAdd: (payload: MetubeAddPayload) =>
    request<{ status: string; msg?: string }>('/metube/add', { method: 'POST', body: JSON.stringify(payload) }),
  metubeDelete: (ids: string[], where: 'queue' | 'done') =>
    request<{ status: string }>('/metube/delete', { method: 'POST', body: JSON.stringify({ ids, where }) }),
  metubeStart: (ids: string[]) =>
    request<{ status: string }>('/metube/start', { method: 'POST', body: JSON.stringify({ ids }) }),

  regenerateCalendarToken: () => request<Settings>('/settings/regenerate-calendar-token', { method: 'POST' }),

  tagging: {
    backlog: () => request<TaggingItem[]>('/tagging/backlog'),
    scanNow: () => request<TestConnectionResult>('/tagging/scan', { method: 'POST' }),
    tracklist: (itemId: number) => request<TrackChoice[]>(`/tagging/${itemId}/tracklist`),
    confirm: (itemId: number, payload: TaggingConfirmPayload) =>
      request<TaggingItem>(`/tagging/${itemId}/confirm`, { method: 'POST', body: JSON.stringify(payload) }),
    rescan: (itemId: number) => request<TaggingItem>(`/tagging/${itemId}/rescan`, { method: 'POST' }),
    discard: (itemId: number) => request<{ status: string }>(`/tagging/${itemId}`, { method: 'DELETE' }),
    releaseGroups: (artistMusicbrainzId: string) =>
      request<ReleaseGroupChoice[]>(`/tagging/identify/release-groups?artist_musicbrainz_id=${encodeURIComponent(artistMusicbrainzId)}`),
    identify: (payload: TaggingIdentifyPayload) =>
      request<TaggingItem[]>('/tagging/identify', { method: 'POST', body: JSON.stringify(payload) }),
  },

  authStatus: () => request<AuthStatus>('/auth/status'),
  authSetup: (username: string, password: string) =>
    request<AuthStatus>('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  authLogin: (username: string, password: string) =>
    request<AuthStatus>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  authLogout: () => request<{ status: string }>('/auth/logout', { method: 'POST' }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ status: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
}

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  album: 'Album',
  ep: 'EP',
  single: 'Single',
  compilation: 'Compilation',
  other: 'Autre',
}

export const ALL_RELEASE_TYPES: ReleaseType[] = ['album', 'ep', 'single', 'compilation']
