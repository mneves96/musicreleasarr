import { useEffect, useMemo, useState } from 'react'
import type { Artist } from '../api'
import ArtistCard from './ArtistCard'
import ArtistListRow from './ArtistListRow'

type ViewMode = 'grid' | 'list'
type SortBy = 'name' | 'albums' | 'latest'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = localStorage.getItem(key)
  return (allowed as readonly string[]).includes(stored ?? '') ? (stored as T) : fallback
}

// Grille/liste triable et filtrable partagee entre l'onglet Suivis
// (FollowedListPage) et l'onglet Recommandations Last.fm (RecommendedArtistsPage) -
// les deux listent le meme type Artist, seule la source des donnees (et l'action
// d'en-tete : importer des favoris vs rafraichir les recommandations) differe,
// donc ce qui reste ici (recherche, tri, bascule grille/liste, persistance du
// choix) n'a pas de raison d'exister en deux versions.
export default function ArtistListView({
  artists,
  storageKeyPrefix,
  emptyFilterMessage = 'Aucun artiste ne correspond au filtre.',
}: {
  artists: Artist[]
  storageKeyPrefix: string
  emptyFilterMessage?: string
}) {
  const [view, setView] = useState<ViewMode>(() =>
    readStored(`${storageKeyPrefix}.view`, ['grid', 'list'] as const, 'grid')
  )
  const [sortBy, setSortBy] = useState<SortBy>(() =>
    readStored(`${storageKeyPrefix}.sortBy`, ['name', 'albums', 'latest'] as const, 'name')
  )
  const [query, setQuery] = useState('')

  useEffect(() => {
    localStorage.setItem(`${storageKeyPrefix}.view`, view)
  }, [view, storageKeyPrefix])

  useEffect(() => {
    localStorage.setItem(`${storageKeyPrefix}.sortBy`, sortBy)
  }, [sortBy, storageKeyPrefix])

  const visibleArtists = useMemo(() => {
    let list = artists
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === 'albums') {
      sorted.sort((a, b) => b.album_count - a.album_count)
    } else if (sortBy === 'latest') {
      sorted.sort((a, b) => (b.latest_release_date ?? '').localeCompare(a.latest_release_date ?? ''))
    }
    return sorted
  }, [artists, query, sortBy])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom..."
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="name">Trier : Nom (A-Z)</option>
          <option value="albums">Trier : Nombre d'albums</option>
          <option value="latest">Trier : Sortie la plus recente</option>
        </select>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setView('grid')}
            className={`text-xs px-3 py-1.5 rounded-md ${view === 'grid' ? 'bg-neutral-700' : 'bg-neutral-900 text-neutral-400'}`}
          >
            Details
          </button>
          <button
            onClick={() => setView('list')}
            className={`text-xs px-3 py-1.5 rounded-md ${view === 'list' ? 'bg-neutral-700' : 'bg-neutral-900 text-neutral-400'}`}
          >
            Liste
          </button>
        </div>
      </div>

      {visibleArtists.length === 0 && <p className="text-neutral-400 text-sm">{emptyFilterMessage}</p>}

      {view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleArtists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {visibleArtists.map((a) => (
            <ArtistListRow key={a.id} artist={a} />
          ))}
        </div>
      )}
    </div>
  )
}
