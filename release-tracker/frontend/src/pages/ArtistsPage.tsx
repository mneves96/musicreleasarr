import { useSearchParams } from 'react-router-dom'
import FollowedListPage from './FollowedListPage'
import RecommendedArtistsPage from './RecommendedArtistsPage'

type Tab = 'followed' | 'recommended'

const tabClass = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-sm font-medium ${
    active ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
  }`

export default function ArtistsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'recommended' ? 'recommended' : 'followed'

  function setTab(next: Tab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'followed') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-neutral-800 pb-2">
        <button onClick={() => setTab('followed')} className={tabClass(tab === 'followed')}>
          Suivis
        </button>
        <button onClick={() => setTab('recommended')} className={tabClass(tab === 'recommended')}>
          Recommandations Last.fm
        </button>
      </div>
      {tab === 'followed' ? <FollowedListPage /> : <RecommendedArtistsPage />}
    </div>
  )
}
