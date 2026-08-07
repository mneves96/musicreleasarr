import { Link } from 'react-router-dom'
import type { Artist } from '../api'

export default function ArtistListRow({ artist }: { artist: Artist }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-md bg-app-surface border border-app-border hover:border-app-text-faint transition-colors"
    >
      {artist.image_url ? (
        <img src={artist.image_url} alt="" className="w-9 h-9 rounded-full object-cover bg-app-surface-hover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-app-surface-hover flex items-center justify-center text-sm shrink-0">🎤</div>
      )}
      <span className="font-medium truncate">{artist.name}</span>
      {artist.area_name && (
        <span className="text-xs text-app-text-faint truncate hidden sm:inline">{artist.area_name}</span>
      )}
      <span className="text-xs text-app-text-muted whitespace-nowrap ml-auto">
        {artist.album_count} album{artist.album_count > 1 ? 's' : ''}
      </span>
      <div className="flex gap-1 shrink-0">
        {artist.recommended_because.length > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded bg-app-surface-hover"
            title={`Base sur : ${artist.recommended_because.map((s) => s.name).join(', ')}`}
          >
            🔗
          </span>
        )}
        {artist.notify_enabled && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-app-surface-hover" title="Notifications activees">
            🔔
          </span>
        )}
        {artist.auto_download && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-app-surface-hover" title="Telechargement automatique">
            ⬇
          </span>
        )}
      </div>
    </Link>
  )
}
