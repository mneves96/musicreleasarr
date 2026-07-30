import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, RELEASE_TYPE_LABELS, type Release, type Track } from '../api'
import { DownloadBadge, OwnershipBadge } from './StatusBadge'

export default function ReleaseRow({
  release,
  showArtist = false,
  onChanged,
}: {
  release: Release
  showArtist?: boolean
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [tracksLoading, setTracksLoading] = useState(false)

  async function download() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.downloadRelease(release.id)
      setMessage(result.message)
      onChanged?.()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function toggleTracks() {
    if (tracks !== null) {
      setTracks(null)
      return
    }
    setTracksLoading(true)
    setMessage(null)
    try {
      setTracks(await api.listTracks(release.id))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Impossible de recuperer les pistes')
    } finally {
      setTracksLoading(false)
    }
  }

  async function downloadTrack(videoId: string) {
    try {
      const result = await api.downloadTrack(release.id, videoId)
      setMessage(result.message)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    }
  }

  return (
    <div className="py-2 border-b border-neutral-800 last:border-0">
      <div className="flex items-center gap-3">
        {release.cover_url ? (
          <img src={release.cover_url} alt="" className="w-12 h-12 rounded object-cover bg-neutral-800" />
        ) : (
          <div className="w-12 h-12 rounded bg-neutral-800 flex items-center justify-center text-lg">🎧</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{release.title}</div>
          <div className="text-sm text-neutral-400 truncate">
            {showArtist && (
              <Link to={`/artists/${release.artist_id}`} className="hover:underline">
                {release.artist_name}
              </Link>
            )}
            {showArtist && ' - '}
            {RELEASE_TYPE_LABELS[release.release_type]}
            {release.release_date && ` - ${release.release_date}`}
          </div>
        </div>
        <OwnershipBadge status={release.ownership_status} />
        <DownloadBadge
          status={release.download_status}
          progress={release.download_progress}
          error={release.download_error}
        />
        {release.ownership_status === 'missing' && release.download_status !== 'queued' && (
          <button
            onClick={download}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
          >
            {busy ? '...' : 'Telecharger'}
          </button>
        )}
        <button
          onClick={toggleTracks}
          disabled={tracksLoading}
          className="text-xs px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800"
          title="Voir les pistes"
        >
          {tracksLoading ? '...' : tracks ? '▾' : '▸'}
        </button>
      </div>
      {message && <div className="text-xs text-neutral-400 mt-1 ml-16">{message}</div>}
      {!message && release.download_status === 'failed' && release.download_error && (
        <div className="text-xs text-red-400 mt-1 ml-16">{release.download_error}</div>
      )}
      {tracks && (
        <ul className="mt-2 ml-16 flex flex-col gap-1">
          {tracks.map((t) => (
            <li key={t.video_id} className="flex items-center justify-between text-sm text-neutral-300">
              <span className="truncate">
                {t.title} {t.duration && <span className="text-neutral-500">({t.duration})</span>}
              </span>
              <button
                onClick={() => downloadTrack(t.video_id)}
                className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 whitespace-nowrap ml-2"
              >
                Telecharger
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
