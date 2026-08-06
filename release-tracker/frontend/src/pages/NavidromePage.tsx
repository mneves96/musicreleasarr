import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type NavidromeStats, type NowPlayingEntry, type RecentlyPlayedAlbum } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'

const NOW_PLAYING_POLL_MS = 10000
const SCAN_POLL_INTERVAL_MS = 4000
const SCAN_POLL_MAX_TICKS = 15

function formatPlayedDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR')
}

function StatCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className="text-lg font-semibold">{value ?? '-'}</div>
    </div>
  )
}

export default function NavidromePage() {
  const [stats, setStats] = useState<NavidromeStats | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[]>([])
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedAlbum[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanBusy, setScanBusy] = useState<'quick' | 'full' | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const scanPollRef = useRef<number | null>(null)

  const loadStats = useCallback(() => api.navidromeStats().then(setStats), [])
  const loadNowPlaying = useCallback(() => api.navidromeNowPlaying().then(setNowPlaying), [])
  const loadRecentlyPlayed = useCallback(() => api.navidromeRecentlyPlayed().then(setRecentlyPlayed), [])

  useEffect(() => {
    Promise.all([loadStats(), loadNowPlaying(), loadRecentlyPlayed()])
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [loadStats, loadNowPlaying, loadRecentlyPlayed])

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
        if (ticks >= SCAN_POLL_MAX_TICKS && scanPollRef.current) {
          window.clearInterval(scanPollRef.current)
          scanPollRef.current = null
        }
      }, SCAN_POLL_INTERVAL_MS)
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setScanBusy(null)
    }
  }

  if (loading) return <LoadingBlock />

  if (error) {
    return (
      <div className="text-neutral-400">
        <p>{error}</p>
        <p className="mt-2">
          Configure la connexion Navidrome dans{' '}
          <Link to="/settings" className="text-purple-400 hover:underline">
            Reglages
          </Link>{' '}
          pour voir cet onglet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Navidrome</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Artistes" value={stats?.artist_count} />
        <StatCard label="Albums" value={stats?.album_count} />
        <StatCard label="Elements au dernier scan" value={stats?.last_scan_count} />
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500 mb-1">Etat</div>
          <div className={`text-sm font-medium ${stats?.scanning ? 'text-blue-300' : 'text-green-300'}`}>
            {stats?.scanning ? 'Scan en cours...' : 'A jour'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => scan(false)}
          disabled={scanBusy !== null}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
        >
          {scanBusy === 'quick' && <Spinner className="w-4 h-4" />}
          Scanner la bibliotheque
        </button>
        <button
          onClick={() => scan(true)}
          disabled={scanBusy !== null}
          title="Reverifie tous les fichiers et retire de Navidrome ceux qui n'existent plus sur le disque"
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
        >
          {scanBusy === 'full' && <Spinner className="w-4 h-4" />}
          Nettoyer les fichiers manquants
        </button>
        {scanMessage && <span className="text-sm text-neutral-400">{scanMessage}</span>}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3">Sessions d'ecoute en cours</h2>
        {nowPlaying.length === 0 ? (
          <p className="text-sm text-neutral-400">Personne n'ecoute quoi que ce soit en ce moment.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {nowPlaying.map((entry, idx) => (
              <li key={idx} className="flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{entry.title ?? 'Titre inconnu'}</span>
                    {entry.artist && <span className="text-neutral-400"> - {entry.artist}</span>}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">
                    {entry.username && `${entry.username} · `}
                    {entry.album}
                    {entry.player_name && ` · ${entry.player_name}`}
                  </div>
                </div>
                {entry.minutes_ago != null && (
                  <span className="text-xs text-neutral-500 whitespace-nowrap shrink-0">
                    {entry.minutes_ago === 0 ? "a l'instant" : `il y a ${entry.minutes_ago} min`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h2 className="font-medium mb-3">Ecoutes recentes</h2>
        {recentlyPlayed.length === 0 ? (
          <p className="text-sm text-neutral-400">Aucun historique d'ecoute pour le moment.</p>
        ) : (
          <ul className="flex flex-col">
            {recentlyPlayed.map((album, idx) => (
              <li
                key={album.id}
                className={`flex items-center justify-between text-sm gap-2 px-2 py-1.5 rounded ${
                  idx % 2 === 1 ? 'bg-neutral-800/40' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{album.name}</div>
                  {album.artist && <div className="truncate text-xs text-neutral-400">{album.artist}</div>}
                </div>
                <div className="text-xs text-neutral-500 whitespace-nowrap text-right shrink-0">
                  {album.play_count != null && <div>{album.play_count} lecture{album.play_count > 1 ? 's' : ''}</div>}
                  {album.played && <div>{formatPlayedDate(album.played)}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
