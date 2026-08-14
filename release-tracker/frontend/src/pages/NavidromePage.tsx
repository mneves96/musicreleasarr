import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  navidromeCoverArtUrl,
  type AlbumDecade,
  type NavidromeStarred,
  type NavidromeStats,
  type NowPlayingEntry,
  type RecentlyAddedAlbum,
  type RecentlyPlayedAlbum,
  type StarredAlbum,
} from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'
import { useLanguage } from '../context/LanguageContext'

const NOW_PLAYING_POLL_MS = 10000
const SCAN_POLL_INTERVAL_MS = 4000
const SCAN_POLL_MAX_TICKS = 15
const GENRE_LIMIT = 20
const RECENTLY_ADDED_LIMIT = 24

function formatPlayedDate(iso: string | null, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString(locale)
}

function StatCard({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-4">
      <div className="text-xs text-app-text-faint mb-1">{label}</div>
      <div className="text-lg font-semibold">{value ?? '-'}</div>
    </div>
  )
}

function BarRow({ label, count, percent }: { label: string; count: number; percent: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 truncate text-app-text-muted shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-app-surface-hover rounded-full overflow-hidden">
        <div className="h-full bg-app-accent" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-app-text-faint shrink-0 whitespace-nowrap w-14 text-right">{count}</span>
    </div>
  )
}

// Vignette album partagee entre "Ajouts recents" et "Favoris" - lien externe
// vers la fiche album dans l'interface web native de Navidrome (construit a
// partir de web_url, voir NavidromeStats) plutot qu'une lecture dans l'app :
// le lecteur audio de musicreleasarr ne pilote que YouTube Music (voir
// PlayerContext.tsx), Navidrome reste la source de verite pour l'ecoute
// reelle des fichiers.
function AlbumTile({
  id,
  name,
  artist,
  coverArtId,
  webUrl,
  subtitle,
}: {
  id: string
  name: string
  artist: string | null
  coverArtId: string | null
  webUrl: string | null
  subtitle?: string
}) {
  const { t } = useLanguage()
  const href = webUrl ? `${webUrl.replace(/\/$/, '')}/app/#/album/${id}/show` : null
  const content = (
    <>
      {coverArtId ? (
        <img src={navidromeCoverArtUrl(coverArtId)} alt="" className="w-full aspect-square rounded object-cover bg-app-surface-hover" />
      ) : (
        <div className="w-full aspect-square rounded bg-app-surface-hover flex items-center justify-center text-2xl">🎧</div>
      )}
      <div className="mt-1.5 min-w-0">
        <div className="text-xs font-medium truncate">{name}</div>
        {artist && <div className="text-xs text-app-text-muted truncate">{artist}</div>}
        {subtitle && <div className="text-[10px] text-app-text-faint truncate">{subtitle}</div>}
      </div>
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" title={t('navidrome.listenInNavidrome')} className="block hover:opacity-80 transition-opacity">
      {content}
    </a>
  ) : (
    <div>{content}</div>
  )
}

export default function NavidromePage() {
  const { t, language } = useLanguage()
  const [stats, setStats] = useState<NavidromeStats | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[]>([])
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedAlbum[]>([])
  const [recentlyAdded, setRecentlyAdded] = useState<RecentlyAddedAlbum[]>([])
  const [starred, setStarred] = useState<NavidromeStarred | null>(null)
  const [decades, setDecades] = useState<AlbumDecade[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanBusy, setScanBusy] = useState<'quick' | 'full' | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const scanPollRef = useRef<number | null>(null)

  const loadStats = useCallback(() => api.navidromeStats(GENRE_LIMIT).then(setStats), [])
  const loadNowPlaying = useCallback(() => api.navidromeNowPlaying().then(setNowPlaying), [])
  const loadRecentlyPlayed = useCallback(() => api.navidromeRecentlyPlayed().then(setRecentlyPlayed), [])
  const loadRecentlyAdded = useCallback(() => api.navidromeRecentlyAdded(RECENTLY_ADDED_LIMIT).then(setRecentlyAdded), [])
  const loadStarred = useCallback(() => api.navidromeStarred().then(setStarred), [])
  const loadDecades = useCallback(() => api.navidromeAlbumDecades().then(setDecades), [])

  useEffect(() => {
    Promise.all([loadStats(), loadNowPlaying(), loadRecentlyPlayed(), loadRecentlyAdded(), loadStarred(), loadDecades()])
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charge une seule fois au montage
  }, [loadStats, loadNowPlaying, loadRecentlyPlayed, loadRecentlyAdded, loadStarred, loadDecades])

  // Sessions en cours : sondees regulierement tant que la page reste ouverte
  // (Subsonic les expire lui-meme cote serveur des qu'un lecteur arrete de
  // reporter sa position, pas besoin de logique cote client pour ca).
  useEffect(() => {
    if (error) return
    const interval = window.setInterval(() => {
      loadNowPlaying().catch(() => {})
    }, NOW_PLAYING_POLL_MS)
    return () => window.clearInterval(interval)
  }, [error, loadNowPlaying])

  useEffect(() => {
    return () => {
      if (scanPollRef.current) window.clearInterval(scanPollRef.current)
    }
  }, [])

  async function scan(full: boolean) {
    setScanBusy(full ? 'full' : 'quick')
    setScanMessage(null)
    try {
      const result = await api.navidromeScan(full)
      setScanMessage(result.message)

      // Le scan tourne en arriere-plan cote Navidrome : on sonde les stats
      // pour voir "scanning" repasser a false et les compteurs se mettre a
      // jour, plutot que de laisser l'utilisateur rafraichir manuellement.
      let ticks = 0
      if (scanPollRef.current) window.clearInterval(scanPollRef.current)
      scanPollRef.current = window.setInterval(() => {
        ticks += 1
        loadStats().catch(() => {})
        loadRecentlyPlayed().catch(() => {})
        loadRecentlyAdded().catch(() => {})
        loadDecades().catch(() => {})
        if (ticks >= SCAN_POLL_MAX_TICKS && scanPollRef.current) {
          window.clearInterval(scanPollRef.current)
          scanPollRef.current = null
        }
      }, SCAN_POLL_INTERVAL_MS)
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setScanBusy(null)
    }
  }

  if (loading) return <LoadingBlock />

  if (error) {
    return (
      <div className="text-app-text-muted">
        <p>{error}</p>
        <p className="mt-2">
          {t('navidrome.connectPrefix')}{' '}
          <Link to="/settings" className="text-app-accent-text hover:underline">
            {t('common.settings')}
          </Link>
          {t('navidrome.connectSuffix')}
        </p>
      </div>
    )
  }

  const webUrl = stats?.web_url ?? null
  const maxGenreCount = Math.max(1, ...(stats?.top_genres.map((g) => g.song_count) ?? [1]))
  const maxDecadeCount = Math.max(1, ...decades.map((d) => d.count))
  const avgAlbumsPerArtist =
    stats && stats.artist_count > 0 ? (stats.album_count / stats.artist_count).toFixed(1) : '-'
  const avgSongsPerAlbum = stats && stats.album_count > 0 ? (stats.song_count / stats.album_count).toFixed(1) : '-'
  const localeTag = language === 'fr' ? 'fr-FR' : 'en-US'

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Navidrome</h1>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-2">
        <StatCard label={t('navidrome.stats.artists')} value={stats?.artist_count} />
        <StatCard label={t('navidrome.stats.albums')} value={stats?.album_count} />
        <StatCard label={t('navidrome.stats.tracks')} value={stats?.song_count} />
        <StatCard label={t('navidrome.stats.lastScanItems')} value={stats?.last_scan_count} />
        <div className="bg-app-surface border border-app-border rounded-lg p-4">
          <div className="text-xs text-app-text-faint mb-1">{t('navidrome.stats.status')}</div>
          <div className={`text-sm font-medium ${stats?.scanning ? 'text-blue-300' : 'text-green-300'}`}>
            {stats?.scanning ? t('navidrome.stats.scanning') : t('navidrome.stats.upToDate')}
          </div>
        </div>
      </div>
      <p className="text-xs text-app-text-faint mb-6">
        {t('navidrome.stats.averages', { albums: avgAlbumsPerArtist, songs: avgSongsPerAlbum })}
      </p>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => scan(false)}
          disabled={scanBusy !== null}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
        >
          {scanBusy === 'quick' && <Spinner className="w-4 h-4" />}
          {t('navidrome.scanLibrary')}
        </button>
        <button
          onClick={() => scan(true)}
          disabled={scanBusy !== null}
          title={t('navidrome.cleanMissingTitle')}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
        >
          {scanBusy === 'full' && <Spinner className="w-4 h-4" />}
          {t('navidrome.cleanMissing')}
        </button>
        {scanMessage && <span className="text-sm text-app-text-muted">{scanMessage}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-app-surface border border-app-border rounded-lg p-4">
          <h2 className="font-medium mb-3">{t('dashboard.topGenres')}</h2>
          {!stats || stats.top_genres.length === 0 ? (
            <p className="text-sm text-app-text-muted">{t('navidrome.noGenre')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {stats.top_genres.map((g) => (
                <BarRow key={g.name} label={g.name} count={g.song_count} percent={(g.song_count / maxGenreCount) * 100} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-app-surface border border-app-border rounded-lg p-4">
          <h2 className="font-medium mb-3">{t('navidrome.decadeBreakdown')}</h2>
          {decades.length === 0 ? (
            <p className="text-sm text-app-text-muted">{t('navidrome.notEnoughYears')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {decades.map((d) => (
                <BarRow key={d.decade} label={d.decade} count={d.count} percent={(d.count / maxDecadeCount) * 100} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3">{t('dashboard.activeSessions')}</h2>
        {nowPlaying.length === 0 ? (
          <p className="text-sm text-app-text-muted">{t('navidrome.noOneListening')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {nowPlaying.map((entry, idx) => (
              <li key={idx} className="flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{entry.title ?? t('dashboard.unknownTitle')}</span>
                    {entry.artist && <span className="text-app-text-muted"> - {entry.artist}</span>}
                  </div>
                  <div className="text-xs text-app-text-faint truncate">
                    {entry.username && `${entry.username} · `}
                    {entry.album}
                    {entry.player_name && ` · ${entry.player_name}`}
                  </div>
                </div>
                {entry.minutes_ago != null && (
                  <span className="text-xs text-app-text-faint whitespace-nowrap shrink-0">
                    {entry.minutes_ago === 0 ? t('navidrome.justNow') : t('navidrome.minutesAgo', { n: entry.minutes_ago })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3">{t('dashboard.recentAdditions')}</h2>
        {recentlyAdded.length === 0 ? (
          <p className="text-sm text-app-text-muted">{t('dashboard.noRecentAlbum')}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {recentlyAdded.map((a) => (
              <AlbumTile
                key={a.id}
                id={a.id}
                name={a.name}
                artist={a.artist}
                coverArtId={a.cover_art_id}
                webUrl={webUrl}
                subtitle={a.created ? t('dashboard.addedOn', { date: a.created.slice(0, 10) }) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3">{t('navidrome.recentListens')}</h2>
        {recentlyPlayed.length === 0 ? (
          <p className="text-sm text-app-text-muted">{t('navidrome.noListenHistory')}</p>
        ) : (
          <ul className="flex flex-col">
            {recentlyPlayed.map((album, idx) => (
              <li
                key={album.id}
                className={`flex items-center justify-between text-sm gap-2 px-2 py-1.5 rounded ${
                  idx % 2 === 1 ? 'bg-app-surface-hover/40' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{album.name}</div>
                  {album.artist && <div className="truncate text-xs text-app-text-muted">{album.artist}</div>}
                </div>
                <div className="text-xs text-app-text-faint whitespace-nowrap text-right shrink-0">
                  {album.play_count != null && <div>{t('navidrome.plays', { count: album.play_count })}</div>}
                  {album.played && <div>{formatPlayedDate(album.played, localeTag)}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-app-surface border border-app-border rounded-lg p-4">
        <h2 className="font-medium mb-3">{t('navidrome.favorites')}</h2>
        {!starred || (starred.artist_names.length === 0 && starred.albums.length === 0 && starred.song_count === 0) ? (
          <p className="text-sm text-app-text-muted">{t('navidrome.noFavorites')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {starred.artist_names.length > 0 && (
              <div>
                <div className="text-xs text-app-text-faint mb-1.5">
                  {t('navidrome.favoriteArtists', { count: starred.artist_names.length })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {starred.artist_names.map((name) => (
                    <span key={name} className="text-xs px-2 py-1 rounded-full bg-app-surface-hover text-app-text-muted">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {starred.albums.length > 0 && (
              <div>
                <div className="text-xs text-app-text-faint mb-1.5">
                  {t('navidrome.favoriteAlbums', { count: starred.albums.length })}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {starred.albums.map((a: StarredAlbum) => (
                    <AlbumTile key={a.id} id={a.id} name={a.name} artist={a.artist} coverArtId={a.cover_art_id} webUrl={webUrl} />
                  ))}
                </div>
              </div>
            )}

            {starred.song_count > 0 && (
              <p className="text-xs text-app-text-faint">
                {t('navidrome.favoriteTracksTotal', { count: starred.song_count })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
