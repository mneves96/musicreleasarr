import { Link } from 'react-router-dom'
import type { Artist } from '../api'

export default function ArtistListRow({ artist }: { artist: Artist }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition-colors"
    >
      {artist.image_url ? (
        <img src={artist.image_url} alt="" className="w-9 h-9 rounded-full object-cover bg-neutral-800 shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-sm shrink-0">🎤</div>
      )}
      <span className="font-medium truncate">{artist.name}</span>
      {artist.area_name && (
        <span className="text-xs text-neutral-500 truncate hidden sm:inline">{artist.area_name}</span>
      )}
      <span className="text-xs text-neutral-400 whitespace-nowrap ml-auto">
        {artist.album_count} album{artist.album_count > 1 ? 's' : ''}
      </span>
      <div className="flex gap-1 shrink-0">
        {artist.notify_enabled && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800" title="Notifications activees">
            🔔
          </span>
        )}
        {artist.auto_download && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800" title="Telechargement automatique">
            ⬇
          </span>
        )}
      </div>
    </Link>
  )
}
