import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Artist } from '../api'
import ArtistCard from '../components/ArtistCard'
import ArtistListRow from '../components/ArtistListRow'

type ViewMode = 'grid' | 'list'
type SortBy = 'name' | 'albums' | 'latest'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

export default function FollowedListPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const load = useCallback(() => api.listFollowedArtists().then(setArtists), [])

  useEffect(() => {
    load().finally(() => setLoading(false))
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [load])

  async function importFavorites() {
    setImporting(true)
    setImportMessage(null)
    try {
      const result = await api.importFavorites()
      setImportMessage(result.message)

      let ticks = 0
      pollRef.current = window.setInterval(() => {
        ticks += 1
        load()
        if (ticks >= POLL_MAX_TICKS && pollRef.current) {
          window.clearInterval(pollRef.current)
          pollRef.current = null
        }
      }, POLL_INTERVAL_MS)
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setImporting(false)
    }
  }

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

  if (loading) return <p className="text-neutral-400">Chargement...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Artistes suivis ({artists.length})</h1>
        <button
          onClick={importFavorites}
          disabled={importing}
          className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
        >
          {importing ? 'Import en cours...' : 'Importer mes favoris Navidrome'}
        </button>
      </div>
      {importMessage && <p className="text-sm text-neutral-400 mb-4">{importMessage}</p>}

      {artists.length === 0 ? (
        <div className="text-neutral-400">
          <p>Tu ne suis encore aucun artiste.</p>
          <p className="mt-2">
            Utilise la barre de recherche en haut, <Link to="/search" className="text-purple-400 hover:underline">clique ici</Link>{' '}
            pour en trouver un, ou importe tes favoris Navidrome ci-dessus.
          </p>
        </div>
      ) : (
        <>
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

          {visibleArtists.length === 0 && <p className="text-neutral-400 text-sm">Aucun artiste ne correspond au filtre.</p>}

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
        </>
      )}
    </div>
  )
}
