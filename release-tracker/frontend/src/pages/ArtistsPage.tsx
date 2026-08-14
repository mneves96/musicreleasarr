import { useSearchParams } from 'react-router-dom'
import FollowedListPage from './FollowedListPage'
import RecommendedArtistsPage from './RecommendedArtistsPage'
import RecommendedArtistsListenbrainzPage from './RecommendedArtistsListenbrainzPage'
import { useLanguage } from '../context/LanguageContext'

type Tab = 'followed' | 'recommended' | 'recommended-lb'

const tabClass = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-sm font-medium ${
    active ? 'bg-app-surface-hover text-app-text' : 'text-app-text-muted hover:text-app-text hover:bg-app-surface'
  }`

export default function ArtistsPage() {
  const { t } = useLanguage()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'recommended' || tabParam === 'recommended-lb' ? tabParam : 'followed'

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
          {t('artists.tabFollowed')}
        </button>
        <button onClick={() => setTab('recommended')} className={tabClass(tab === 'recommended')}>
          {t('artists.tabRecommendedLastfm')}
        </button>
        <button onClick={() => setTab('recommended-lb')} className={tabClass(tab === 'recommended-lb')}>
          {t('artists.tabRecommendedListenbrainz')}
        </button>
      </div>
      {tab === 'followed' && <FollowedListPage />}
      {tab === 'recommended' && <RecommendedArtistsPage />}
      {tab === 'recommended-lb' && <RecommendedArtistsListenbrainzPage />}
    </div>
  )
}
