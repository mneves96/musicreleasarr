export type ReleaseType = 'album' | 'ep' | 'single' | 'compilation' | 'other'
export type OwnershipStatus = 'unknown' | 'owned' | 'missing'
export type DownloadStatus = 'not_requested' | 'queued' | 'downloaded' | 'failed'

export interface ArtistSearchResult {
  musicbrainz_id: string
  name: string
  disambiguation: string | null
  image_url: string | null
  already_followed: boolean
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
  notified_at: string | null
}

export interface ArtistWithReleases extends Artist {
  releases: Release[]
}

export interface Track {
  title: string
  video_id: string
  duration: string | null
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
}

export interface TestConnectionResult {
  ok: boolean
  message: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`${resp.status} ${resp.statusText} : ${body}`)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

export const api = {
  searchArtists: (q: string) =>
    request<ArtistSearchResult[]>(`/search/artists?q=${encodeURIComponent(q)}`),

  listFollowedArtists: () => request<Artist[]>('/artists'),

  followArtist: (payload: {
    musicbrainz_id: string
    notify_enabled: boolean
    auto_download: boolean
    followed_release_types: ReleaseType[]
  }) => request<Artist>('/artists', { method: 'POST', body: JSON.stringify(payload) }),

  getArtist: (id: number) => request<ArtistWithReleases>(`/artists/${id}`),

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
}

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  album: 'Album',
  ep: 'EP',
  single: 'Single',
  compilation: 'Compilation',
  other: 'Autre',
}

export const ALL_RELEASE_TYPES: ReleaseType[] = ['album', 'ep', 'single', 'compilation']
