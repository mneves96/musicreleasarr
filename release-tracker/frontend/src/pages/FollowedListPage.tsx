import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Artist } from '../api'
import ArtistListView from '../components/ArtistListView'
import { LoadingBlock } from '../components/Spinner'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

export default function FollowedListPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
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

  if (loading) return <LoadingBlock />

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
        <ArtistListView artists={artists} storageKeyPrefix="followedList" />
      )}
    </div>
  )
}
