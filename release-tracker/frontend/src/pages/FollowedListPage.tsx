import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ArtistSortBy } from '../api'
import ArtistListView from '../components/ArtistListView'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

export default function FollowedListPage() {
  const [total, setTotal] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const fetchPage = useCallback(
    (params: { offset: number; limit: number; q: string; sort: ArtistSortBy }) => api.listFollowedArtists(params),
    []
  )

  async function importFavorites() {
    setImporting(true)
    setImportMessage(null)
    try {
      const result = await api.importFavorites()
      setImportMessage(result.message)

      let ticks = 0
      pollRef.current = window.setInterval(() => {
        ticks += 1
        setReloadToken((t) => t + 1)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Artistes suivis{total !== null ? ` (${total})` : ''}</h1>
        <button
          onClick={importFavorites}
          disabled={importing}
          className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
        >
          {importing ? 'Import en cours...' : 'Importer mes favoris Navidrome'}
        </button>
      </div>
      {importMessage && <p className="text-sm text-neutral-400 mb-4">{importMessage}</p>}

      <ArtistListView
        storageKeyPrefix="followedList"
        fetchPage={fetchPage}
        reloadToken={reloadToken}
        onTotalChange={setTotal}
        emptyMessage={
          <div className="text-neutral-400">
            <p>Tu ne suis encore aucun artiste.</p>
            <p className="mt-2">
              Utilise la barre de recherche en haut, <Link to="/search" className="text-purple-400 hover:underline">clique ici</Link>{' '}
              pour en trouver un, ou importe tes favoris Navidrome ci-dessus.
            </p>
          </div>
        }
      />
    </div>
  )
}
