import { useEffect, useState } from 'react'
import { api, type TopTrack } from '../api'
import { usePlayer, type QueueTrack } from '../context/PlayerContext'
import PlayGlyph from './PlayGlyph'
import Spinner from './Spinner'

// Section "Titres populaires" de la fiche artiste : playcount Last.fm, lecture
// directe via le lecteur audio existant (meme file d'attente que les releases,
// voir ReleaseRow.tsx). Se masque silencieusement en cas d'erreur/absence de
// donnees (ex: cle API Last.fm non configuree) plutot que d'afficher un
// bandeau d'erreur sur chaque fiche artiste visitee.
export default function TopTracksSection({ artistId, artistName }: { artistId: number; artistName: string }) {
  const [tracks, setTracks] = useState<TopTrack[] | null>(null)
  const [loading, setLoading] = useState(true)
  const { playQueue } = usePlayer()

  useEffect(() => {
    let cancelled = false
    setTracks(null)
    setLoading(true)
    api
      .getArtistTopTracks(artistId)
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 mb-6">
        <Spinner className="w-4 h-4" />
        Chargement des titres populaires...
      </div>
    )
  }

  if (!tracks || tracks.length === 0) return null

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
      <h2 className="font-medium mb-3">Titres populaires</h2>
      <ul className="flex flex-col gap-1">
        {tracks.map((t) => (
          <li key={t.title} className="flex items-center gap-3 py-1.5">
            <button
              onClick={() => play(t)}
              disabled={!t.video_id}
              className="group/cover relative w-10 h-10 rounded overflow-hidden shrink-0 bg-neutral-800 disabled:cursor-default"
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
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="truncate text-xs text-neutral-400">
                {t.album_title}
                {t.album_title && t.release_date && ' · '}
                {t.release_date}
              </div>
            </div>
            {t.playcount != null && (
              <span className="text-xs text-neutral-500 whitespace-nowrap shrink-0">
                {t.playcount.toLocaleString('fr-FR')} lectures
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
