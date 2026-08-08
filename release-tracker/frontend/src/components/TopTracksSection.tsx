import { useEffect, useState } from 'react'
import { api, type TopTrack } from '../api'
import { usePlayer, type QueueTrack } from '../context/PlayerContext'
import { useToast } from '../context/ToastContext'
import PlayGlyph from './PlayGlyph'
import DownloadGlyph from './DownloadGlyph'
import Spinner from './Spinner'

const PAGE_SIZE = 5

// Section "Titres populaires" de la fiche artiste : playcount Last.fm, lecture
// directe via le lecteur audio existant (meme file d'attente que les releases,
// voir ReleaseRow.tsx). Se masque silencieusement en cas d'erreur/absence de
// donnees (ex: cle API Last.fm non configuree) plutot que d'afficher un
// bandeau d'erreur sur chaque fiche artiste visitee.
export default function TopTracksSection({ artistId, artistName }: { artistId: number; artistName: string }) {
  const [tracks, setTracks] = useState<TopTrack[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(null)
  const { playQueue } = usePlayer()
  const { showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    setTracks(null)
    setLoading(true)
    setLimit(PAGE_SIZE)
    api
      .getArtistTopTracks(artistId, PAGE_SIZE)
      .then((data) => {
        if (!cancelled) setTracks(data)
      })
      .catch(() => {
        if (!cancelled) setTracks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [artistId])

  // "Afficher plus" redemande simplement le top N+5 a Last.fm plutot qu'une
  // vraie pagination par offset - voir routers/artists.py:top_tracks.
  async function loadMore() {
    const nextLimit = limit + PAGE_SIZE
    setLoadingMore(true)
    try {
      const data = await api.getArtistTopTracks(artistId, nextLimit)
      setTracks(data)
      setLimit(nextLimit)
    } catch {
      // Ignore silencieusement, comme le chargement initial.
    } finally {
      setLoadingMore(false)
    }
  }

  function toQueue(list: TopTrack[]): QueueTrack[] {
    return list
      .filter((t): t is TopTrack & { video_id: string } => !!t.video_id)
      .map((t) => ({
        video_id: t.video_id,
        title: t.title,
        artist_id: artistId,
        artist_name: artistName,
        album_title: t.album_title ?? '',
        cover_url: t.cover_url,
      }))
  }

  function play(track: TopTrack) {
    if (!track.video_id || !tracks) return
    const queue = toQueue(tracks)
    const startIndex = queue.findIndex((t) => t.video_id === track.video_id)
    if (startIndex === -1) return
    playQueue(queue, startIndex)
  }

  async function download(track: TopTrack) {
    if (track.release_id == null || !track.video_id) return
    setDownloadingVideoId(track.video_id)
    try {
      const result = await api.downloadTrack(track.release_id, track.video_id)
      if (result.ok) showToast('Telechargement envoye a MeTube')
    } finally {
      setDownloadingVideoId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-app-text-muted mb-6">
        <Spinner className="w-4 h-4" />
        Chargement des titres populaires...
      </div>
    )
  }

  if (!tracks || tracks.length === 0) return null

  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
      <h2 className="font-medium mb-3">Titres populaires</h2>
      <ul className="flex flex-col gap-1">
        {tracks.map((t) => (
          <li key={t.title} className="flex items-center gap-3 py-1.5">
            <button
              onClick={() => play(t)}
              disabled={!t.video_id}
              className="group/cover relative w-10 h-10 rounded overflow-hidden shrink-0 bg-app-surface-hover disabled:cursor-default"
              title={t.video_id ? 'Ecouter ce titre' : 'Aucune source audio trouvee'}
            >
              {t.cover_url ? (
                <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-sm">🎧</span>
              )}
              {t.video_id && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/cover:bg-black/50 transition-colors">
                  <PlayGlyph className="w-4 h-4 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" />
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {t.title}
                {t.featured_artists.length > 0 && (
                  <span className="text-app-text-faint font-normal"> (feat. {t.featured_artists.join(', ')})</span>
                )}
              </div>
              <div className="truncate text-xs text-app-text-muted">
                {t.album_title}
                {t.album_title && t.release_date && ' · '}
                {t.release_date}
              </div>
            </div>
            {t.playcount != null && (
              <span className="text-xs text-app-text-faint whitespace-nowrap shrink-0">
                {t.playcount.toLocaleString('fr-FR')} lectures
              </span>
            )}
            {t.release_id != null && t.video_id && (
              <button
                onClick={() => download(t)}
                disabled={downloadingVideoId === t.video_id}
                title="Telecharger ce titre"
                className="flex items-center justify-center w-8 h-8 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50 shrink-0"
              >
                {downloadingVideoId === t.video_id ? <Spinner className="w-4 h-4" /> : <DownloadGlyph className="w-4 h-4" />}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-center">
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
        >
          {loadingMore && <Spinner className="w-3 h-3" />}
          Afficher plus
        </button>
      </div>
    </div>
  )
}
