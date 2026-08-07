import { Link } from 'react-router-dom'
import type { Artist } from '../api'

export default function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="flex flex-col gap-2 p-4 rounded-lg bg-app-surface border border-app-border hover:border-app-text-faint transition-colors"
    >
      <div className="flex items-center gap-3">
        {artist.image_url ? (
          <img src={artist.image_url} alt="" className="w-14 h-14 rounded-full object-cover bg-app-surface-hover shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-app-surface-hover flex items-center justify-center text-xl shrink-0">🎤</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{artist.name}</div>
          {artist.area_name && <div className="text-xs text-app-text-faint truncate">{artist.area_name}</div>}
        </div>
      </div>

      {artist.bio && <p className="text-xs text-app-text-muted line-clamp-2">{artist.bio}</p>}

      {artist.recommended_because.length > 0 && (
        <p className="text-xs text-app-accent-text/80 truncate">
          Base sur : {artist.recommended_because.map((s) => s.name).join(', ')}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-app-text-muted mt-1 flex-wrap gap-1">
        <span>
          {artist.album_count} album{artist.album_count > 1 ? 's' : ''}
          {artist.release_count > artist.album_count && ` · ${artist.release_count} sorties au total`}
        </span>
        <div className="flex gap-2">
          {artist.notify_enabled && <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">Notifications</span>}
          {artist.auto_download && <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">Auto-telechargement</span>}
        </div>
      </div>
    </Link>
  )
}
