import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ArtistSortBy } from '../api'
import ArtistListView from '../components/ArtistListView'
import { useLanguage } from '../context/LanguageContext'

const POLL_INTERVAL_MS = 4000
const POLL_MAX_TICKS = 15 // ~1 minute

export default function RecommendedArtistsPage() {
  const { t } = useLanguage()
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
      setRefreshMessage(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setRefreshing(false)
    }
  }

  if (configError) {
    return (
      <div className="text-app-text-muted">
        <p>{configError}</p>
        <p className="mt-2">
          {t('recommendations.lastfm.configHintPrefix')}{' '}
          <Link to="/settings" className="text-app-accent-text hover:underline">
            {t('common.settings')}
          </Link>{' '}
          {t('recommendations.lastfm.configHintSuffix')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">{t('artists.tabRecommendedLastfm')}{total !== null ? ` (${total})` : ''}</h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 whitespace-nowrap"
        >
          {refreshing ? t('recommendations.refreshing') : t('recommendations.refresh')}
        </button>
      </div>
      {refreshMessage && <p className="text-sm text-app-text-muted mb-4">{refreshMessage}</p>}

      <ArtistListView
        storageKeyPrefix="recommendedList"
        fetchPage={fetchPage}
        reloadToken={reloadToken}
        onTotalChange={setTotal}
        emptyMessage={<p className="text-app-text-muted text-sm">{t('recommendations.emptyMessage')}</p>}
        emptyFilterMessage={t('recommendations.emptyFilterMessage')}
        onError={(err) => setConfigError(err instanceof Error ? err.message : t('common.error'))}
      />
    </div>
  )
}
