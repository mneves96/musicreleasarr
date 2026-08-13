import { useCallback, useRef, useState } from 'react'
import { api, type ArtistSortBy } from '../api'
import ArtistListView from '../components/ArtistListView'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

// Pendant MusicBrainz de RecommendedArtistsPage.tsx (Last.fm) : meme
// composant ArtistListView, meme mise en page/comportement (rafraichir,
// sonder, filtrer/trier/vue grille-liste, defilement infini) - seule la
// source des recommandations differe cote backend (relations d'artiste
// MusicBrainz plutot que artist.getSimilar Last.fm), et il n'y a ici aucune
// configuration prealable a verifier (MusicBrainz est public, contrairement
// a Last.fm qui necessite une cle API + un compte connecte).
export default function RecommendedArtistsMusicbrainzPage() {
  const [total, setTotal] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const fetchPage = useCallback(
    (params: { offset: number; limit: number; q: string; sort: ArtistSortBy }) =>
      api.getRecommendedArtistsMusicbrainz(params),
    []
  )

  // Stockees comme de vrais Artist en base et rafraichies chaque nuit par le
  // scheduler (meme cron que les recommandations Last.fm, voir Reglages) -
  // ce bouton lance le meme rafraichissement a la demande. Il tourne en
  // tache de fond cote serveur (1 requete MusicBrainz par artiste suivi,
  // throttlee a 1 req/s), donc on sonde la liste plutot que d'attendre une
  // reponse synchrone.
  async function refresh() {
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const result = await api.refreshRecommendedArtistsMusicbrainz()
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Recommandations MusicBrainz{total !== null ? ` (${total})` : ''}</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 whitespace-nowrap"
        >
          {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
        </button>
      </div>
      {refreshMessage && <p className="text-sm text-app-text-muted mb-4">{refreshMessage}</p>}
      {loadError && <p className="text-sm text-red-400 mb-4">{loadError}</p>}

      <ArtistListView
        storageKeyPrefix="recommendedMbList"
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
        onError={(err) => setLoadError(err instanceof Error ? err.message : 'Erreur')}
      />
    </div>
  )
}
