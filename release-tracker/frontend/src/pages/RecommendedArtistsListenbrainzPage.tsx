import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ArtistSortBy } from '../api'
import ArtistListView from '../components/ArtistListView'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

// Pendant ListenBrainz de RecommendedArtistsPage.tsx (Last.fm) : meme
// composant ArtistListView, meme mise en page/comportement (rafraichir,
// sonder, filtrer/trier/vue grille-liste, defilement infini). La difference
// est plus profonde que la simple source cote backend : la "graine" des
// recommandations est ici l'ecoute reelle de l'utilisateur (scrobbles,
// Navidrome -> ListenBrainz) plutot que les artistes suivis dans l'app - donc
// necessite un nom d'utilisateur ListenBrainz configure dans Reglages (pas de
// cle API/OAuth, juste le pseudo, les stats/recommandations y sont publiques).
export default function RecommendedArtistsListenbrainzPage() {
  const [total, setTotal] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [configError, setConfigError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const fetchPage = useCallback(
    (params: { offset: number; limit: number; q: string; sort: ArtistSortBy }) =>
      api.getRecommendedArtistsListenbrainz(params),
    []
  )

  // Stockees comme de vrais Artist en base et rafraichies chaque nuit par le
  // scheduler (voir Reglages > ListenBrainz) - ce bouton lance le meme
  // rafraichissement a la demande. Il tourne en tache de fond cote serveur,
  // donc on sonde la liste plutot que d'attendre une reponse synchrone.
  async function refresh() {
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const result = await api.refreshRecommendedArtistsListenbrainz()
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
      <div className="text-app-text-muted">
        <p>{configError}</p>
        <p className="mt-2">
          Renseigne ton nom d'utilisateur ListenBrainz dans{' '}
          <Link to="/settings" className="text-app-accent-text hover:underline">
            Reglages
          </Link>{' '}
          pour voir des recommandations basees sur tes scrobbles (Navidrome doit deja scrobbler vers ce compte).
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Recommandations ListenBrainz{total !== null ? ` (${total})` : ''}</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 whitespace-nowrap"
        >
          {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
        </button>
      </div>
      {refreshMessage && <p className="text-sm text-app-text-muted mb-4">{refreshMessage}</p>}

      <ArtistListView
        storageKeyPrefix="recommendedLbList"
        fetchPage={fetchPage}
        reloadToken={reloadToken}
        onTotalChange={setTotal}
        emptyMessage={
          <p className="text-app-text-muted text-sm">
            Aucune recommandation disponible pour le moment - reessaie apres un rafraichissement, ou attends le
            prochain rafraichissement automatique planifie dans Reglages.
          </p>
        }
        emptyFilterMessage="Aucune recommandation ne correspond au filtre."
        onError={(err) => setConfigError(err instanceof Error ? err.message : 'Erreur')}
      />
    </div>
  )
}
