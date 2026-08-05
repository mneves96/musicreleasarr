import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, RELEASE_TYPE_LABELS, type Release, type Track } from '../api'
import { DownloadBadge, OwnershipBadge } from './StatusBadge'
import ServiceLink from './ServiceLink'
import { DeezerIcon, LastfmIcon, MusicBrainzIcon, YoutubeMusicIcon } from './ServiceIcons'
import { usePlayer, type QueueTrack } from '../context/PlayerContext'

export default function ReleaseRow({
  release,
  showArtist = false,
  onChanged,
  onTracksLoaded,
}: {
  release: Release
  showArtist?: boolean
  onChanged?: () => void
  onTracksLoaded?: (releaseId: number, tracks: Track[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [tracksLoading, setTracksLoading] = useState(false)
  const [missingBusy, setMissingBusy] = useState(false)
  const [playLoading, setPlayLoading] = useState(false)
  const { playQueue } = usePlayer()

  function toQueue(trackList: Track[]): QueueTrack[] {
    return trackList.map((t) => ({
      video_id: t.video_id,
      title: t.title,
      artist_name: release.artist_name,
      album_title: release.title,
    }))
  }

  // Ecoute avant de telecharger : reutilise la tracklist deja chargee si le
  // detail est deplie, sinon va la chercher pour cette seule ecoute.
  async function play(startIndex: number) {
    if (tracks) {
      playQueue(toQueue(tracks), startIndex)
      return
    }
    setPlayLoading(true)
    setMessage(null)
    try {
      const result = await api.listTracks(release.id)
      setTracks(result)
      onTracksLoaded?.(release.id, result)
      playQueue(toQueue(result), startIndex)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Impossible de recuperer les pistes')
    } finally {
      setPlayLoading(false)
    }
  }

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
      const result = await api.listTracks(release.id)
      setTracks(result)
      onTracksLoaded?.(release.id, result)
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

  async function downloadMissingTracks() {
    if (!tracks) return
    const missing = tracks.filter((t) => t.owned === false)
    if (missing.length === 0) return
    setMissingBusy(true)
    setMessage(null)
    try {
      await Promise.all(missing.map((t) => api.downloadTrack(release.id, t.video_id)))
      setMessage(`${missing.length} piste(s) manquante(s) mise(s) en file d'attente`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setMissingBusy(false)
    }
  }

  const missingTrackCount = tracks?.filter((t) => t.owned === false).length ?? 0
  const downloadLabel = release.ownership_status === 'owned' ? 'Retelecharger' : 'Telecharger'

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
          <div className="flex gap-1 mt-1">
            <ServiceLink
              compact
              href={`https://musicbrainz.org/release-group/${release.musicbrainz_id}`}
              label="MusicBrainz"
              icon={<MusicBrainzIcon />}
            />
            <ServiceLink
              compact
              href={release.deezer_id ? `https://www.deezer.com/album/${release.deezer_id}` : null}
              label="Deezer"
              icon={<DeezerIcon />}
            />
            <ServiceLink compact href={release.youtube_music_url} label="YouTube Music" icon={<YoutubeMusicIcon />} />
            <ServiceLink compact href={release.lastfm_url} label="Last.fm" icon={<LastfmIcon />} />
          </div>
        </div>
        <OwnershipBadge status={release.ownership_status} />
        <DownloadBadge status={release.download_status} error={release.download_error} />
        <button
          onClick={() => play(0)}
          disabled={playLoading}
          className="text-xs px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-50"
          title="Ecouter cette release avant de telecharger"
        >
          {playLoading ? '...' : '▶'}
        </button>
        {release.download_status !== 'queued' && (
          <button
            onClick={download}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? '...' : downloadLabel}
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
        <div className="mt-2 ml-16">
          {missingTrackCount > 0 && (
            <button
              onClick={downloadMissingTracks}
              disabled={missingBusy}
              className="text-xs px-2 py-1 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 mb-2"
            >
              {missingBusy ? '...' : `Telecharger les ${missingTrackCount} piste(s) manquante(s)`}
            </button>
          )}
          <ul className="flex flex-col gap-1">
            {tracks.map((t, idx) => (
              <li key={t.video_id} className="flex items-center justify-between text-sm text-neutral-300 gap-2">
                <button
                  onClick={() => play(idx)}
                  className="text-neutral-500 hover:text-white shrink-0"
                  title="Ecouter cette piste"
                >
                  ▶
                </button>
                <span className="truncate flex-1">
                  {t.title} {t.duration && <span className="text-neutral-500">({t.duration})</span>}
                </span>
                {t.owned === true && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-300 whitespace-nowrap">
                    Possedee
                  </span>
                )}
                {t.owned === false && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-900/50 text-amber-300 whitespace-nowrap">
                    Manquante
                  </span>
                )}
                <button
                  onClick={() => downloadTrack(t.video_id)}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 whitespace-nowrap"
                >
                  {t.owned === true ? 'Retelecharger' : 'Telecharger'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
