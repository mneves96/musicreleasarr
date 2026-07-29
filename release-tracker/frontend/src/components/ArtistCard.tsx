import { Link } from 'react-router-dom'
import type { Artist } from '../api'

export default function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition-colors"
    >
      {artist.image_url ? (
        <img src={artist.image_url} alt="" className="w-14 h-14 rounded-full object-cover bg-neutral-800" />
      ) : (
        <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-xl">🎤</div>
      )}
      <div className="min-w-0">
        <div className="font-medium truncate">{artist.name}</div>
        <div className="text-xs text-neutral-400 flex gap-2 mt-1 flex-wrap">
          {artist.notify_enabled && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-800">Notifications</span>
          )}
          {artist.auto_download && (
            <span className="px-1.5 py-0.5 rounded bg-neutral-800">Auto-telechargement</span>
          )}
        </div>
      </div>
    </Link>
  )
}
