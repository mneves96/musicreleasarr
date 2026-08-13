import { useSearchParams } from 'react-router-dom'
import FollowedListPage from './FollowedListPage'
import RecommendedArtistsPage from './RecommendedArtistsPage'
import RecommendedArtistsMusicbrainzPage from './RecommendedArtistsMusicbrainzPage'

type Tab = 'followed' | 'recommended' | 'recommended-mb'

const tabClass = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-sm font-medium ${
    active ? 'bg-app-surface-hover text-app-text' : 'text-app-text-muted hover:text-app-text hover:bg-app-surface'
  }`

export default function ArtistsPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'recommended' || tabParam === 'recommended-mb' ? tabParam : 'followed'

  function setTab(next: Tab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'followed') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-app-border pb-2">
        <button onClick={() => setTab('followed')} className={tabClass(tab === 'followed')}>
          Suivis
        </button>
        <button onClick={() => setTab('recommended')} className={tabClass(tab === 'recommended')}>
          Recommandations Last.fm
        </button>
        <button onClick={() => setTab('recommended-mb')} className={tabClass(tab === 'recommended-mb')}>
          Recommandations MusicBrainz
        </button>
      </div>
      {tab === 'followed' && <FollowedListPage />}
      {tab === 'recommended' && <RecommendedArtistsPage />}
      {tab === 'recommended-mb' && <RecommendedArtistsMusicbrainzPage />}
    </div>
  )
}
