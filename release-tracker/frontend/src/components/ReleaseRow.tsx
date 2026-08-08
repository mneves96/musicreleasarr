import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, RELEASE_TYPE_LABELS, type Release, type Track } from '../api'
import { OwnershipBadge } from './StatusBadge'
import ServiceLink from './ServiceLink'
import { DeezerIcon, LastfmIcon, MusicBrainzIcon, YoutubeMusicIcon } from './ServiceIcons'
import { usePlayer, type QueueTrack } from '../context/PlayerContext'
import { useToast } from '../context/ToastContext'
import Spinner from './Spinner'
import PlayGlyph from './PlayGlyph'
import DownloadGlyph from './DownloadGlyph'

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
  const { showToast } = useToast()

  function toQueue(trackList: Track[]): QueueTrack[] {
    return trackList.map((t) => ({
      video_id: t.video_id,
      title: t.title,
      artist_id: release.artist_id,
      artist_name: release.artist_name,
      album_title: release.title,
      cover_url: release.cover_url,
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
      if (result.ok) showToast('Telechargement envoye a MeTube')
      else setMessage(result.message)
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
      if (result.ok) showToast('Telechargement envoye a MeTube')
      else setMessage(result.message)
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
      showToast(`${missing.length} piste(s) envoyee(s) a MeTube`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setMissingBusy(false)
    }
  }

  const missingTrackCount = tracks?.filter((t) => t.owned === false).length ?? 0
  const downloadLabel = release.ownership_status === 'owned' ? 'Retelecharger' : 'Telecharger'

  return (
    <div className="py-2 border-b border-app-border last:border-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => play(0)}
          disabled={playLoading}
          className="group/cover relative w-12 h-12 rounded overflow-hidden shrink-0 bg-app-surface-hover"
          title="Ecouter cette release avant de telecharger"
        >
          {release.cover_url ? (
            <>
              <img src={release.cover_url} alt="" className="w-full h-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/cover:bg-black/50 transition-colors">
                <PlayGlyph className="w-5 h-5 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" />
              </span>
            </>
          ) : (
            <>
              <span className="absolute inset-0 flex items-center justify-center text-lg group-hover/cover:opacity-0 transition-opacity">
                🎧
              </span>
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity">
                <PlayGlyph className="w-5 h-5 text-white" />
              </span>
            </>
          )}
          {playLoading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Spinner className="w-4 h-4 text-white" />
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{release.title}</div>
          <div className="text-sm text-app-text-muted truncate">
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
        <button
          onClick={download}
          disabled={busy}
          title={downloadLabel}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 shrink-0"
        >
          {busy ? <Spinner className="w-4 h-4" /> : <DownloadGlyph className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleTracks}
          disabled={tracksLoading}
          className="text-xs px-2 py-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover"
          title="Voir les pistes"
        >
          {tracksLoading ? '...' : tracks ? '▾' : '▸'}
        </button>
      </div>
      {message && <div className="text-xs text-app-text-muted mt-1 ml-16">{message}</div>}
      {tracks && (
        <div className="mt-2 ml-16">
          {missingTrackCount > 0 && (
            <button
              onClick={downloadMissingTracks}
              disabled={missingBusy}
              className="text-xs px-2 py-1 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 mb-2"
            >
              {missingBusy ? '...' : `Telecharger les ${missingTrackCount} piste(s) manquante(s)`}
            </button>
          )}
          <ul className="flex flex-col">
            {tracks.map((t, idx) => {
              const trackDownloadLabel = t.owned === true ? 'Retelecharger' : 'Telecharger'
              return (
                <li
                  key={t.video_id}
                  className={`flex items-center justify-between text-sm text-app-text-muted gap-2 px-2 py-1.5 rounded ${
                    idx % 2 === 1 ? 'bg-app-surface/60' : ''
                  }`}
                >
                  <button
                    onClick={() => play(idx)}
                    className="flex items-center justify-center w-5 h-5 rounded-full border border-app-text-faint text-app-text-muted text-[10px] hover:text-app-text hover:border-app-text-faint shrink-0"
                    title="Ecouter cette piste"
                  >
                    ▶
                  </button>
                  <span className="truncate flex-1">
                    {t.title}
                    {t.featured_artists.length > 0 && (
                      <span className="text-app-text-faint"> (feat. {t.featured_artists.join(', ')})</span>
                    )}{' '}
                    {t.duration && <span className="text-app-text-faint">({t.duration})</span>}
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
                    title={trackDownloadLabel}
                    className="flex items-center justify-center w-6 h-6 rounded-md bg-app-surface-hover hover:bg-app-border-strong shrink-0"
                  >
                    <DownloadGlyph className="w-3.5 h-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
