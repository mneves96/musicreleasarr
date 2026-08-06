import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ArtistSortBy } from '../api'
import ArtistListView from '../components/ArtistListView'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

export default function RecommendedArtistsPage() {
  const [total, setTotal] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [configError, setConfigError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const fetchPage = useCallback(
    (params: { offset: number; limit: number; q: string; sort: ArtistSortBy }) => api.getRecommendedArtists(params),
    []
  )

  // Stockees comme de vrais Artist en base et rafraichies chaque nuit par le
  // scheduler (voir Reglages > Last.fm) - ce bouton lance le meme
  // rafraichissement a la demande. Il tourne en tache de fond cote serveur
  // (appels Last.fm + resolutions MusicBrainz limitees a 1 req/s), donc on
  // sonde la liste plutot que d'attendre une reponse synchrone.
  async function refresh() {
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const result = await api.refreshRecommendedArtists()
      setRefreshMessage(result.message)

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
      setRefreshMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setRefreshing(false)
    }
  }

  if (configError) {
    return (
      <div className="text-neutral-400">
        <p>{configError}</p>
        <p className="mt-2">
          Renseigne une cle API + secret Last.fm et connecte ton compte dans{' '}
          <Link to="/settings" className="text-purple-400 hover:underline">
            Reglages
          </Link>{' '}
          pour voir des recommandations personnalisees.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Recommandations Last.fm{total !== null ? ` (${total})` : ''}</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
        >
          {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
        </button>
      </div>
      {refreshMessage && <p className="text-sm text-neutral-400 mb-4">{refreshMessage}</p>}

      {total === 0 ? (
        <p className="text-neutral-400 text-sm">
          Aucune recommandation disponible pour le moment - reessaie apres un rafraichissement, ou attends le
          prochain rafraichissement automatique planifie dans Reglages.
        </p>
      ) : (
        <ArtistListView
          storageKeyPrefix="recommendedList"
          fetchPage={fetchPage}
          reloadToken={reloadToken}
          onTotalChange={setTotal}
          emptyFilterMessage="Aucune recommandation ne correspond au filtre."
          onError={(err) => setConfigError(err instanceof Error ? err.message : 'Erreur')}
        />
      )}
    </div>
  )
}
