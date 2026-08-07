import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  RELEASE_TYPE_LABELS,
  type MetubeItem,
  type NavidromeStats,
  type NowPlayingEntry,
  type Release,
  type TaggingItem,
} from '../api'
import { LoadingBlock } from '../components/Spinner'

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function DashboardCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function ConfigHint({ text }: { text: string }) {
  return (
    <p className="text-sm text-neutral-500">
      {text} Configure ca dans{' '}
      <Link to="/settings" className="text-purple-400 hover:underline">
        Reglages
      </Link>
      .
    </p>
  )
}

// Page d'accueil "mission control" : agrege des donnees deja exposees par
// d'autres onglets (sorties, backlog, MeTube, Navidrome) sur une seule vue,
// sans nouvelle logique metier cote backend - chaque widget se degrade
// silencieusement (ConfigHint) si le service correspondant n'est pas
// configure, plutot que de casser toute la page.
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [upcomingReleases, setUpcomingReleases] = useState<Release[]>([])
  const [backlogItems, setBacklogItems] = useState<TaggingItem[]>([])
  const [recentDownloads, setRecentDownloads] = useState<MetubeItem[] | 'not_configured'>([])
  const [navidromeStats, setNavidromeStats] = useState<NavidromeStats | 'not_configured' | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[] | 'not_configured'>([])

  useEffect(() => {
    let cancelled = false

    const today = new Date()
    const in7Days = new Date(today)
    in7Days.setDate(in7Days.getDate() + 7)

    async function load() {
      const [releasesResult, backlogResult, metubeResult, statsResult, nowPlayingResult] = await Promise.allSettled([
        api.listReleases({ from: toISODate(today), to: toISODate(in7Days), limit: 20, order: 'asc' }),
        api.tagging.backlog(),
        api.metubeHistory(),
        api.navidromeStats(),
        api.navidromeNowPlaying(),
      ])
      if (cancelled) return

      setUpcomingReleases(releasesResult.status === 'fulfilled' ? releasesResult.value.results : [])
      setBacklogItems(backlogResult.status === 'fulfilled' ? backlogResult.value : [])
      setRecentDownloads(metubeResult.status === 'fulfilled' ? metubeResult.value.done.slice(-5).reverse() : 'not_configured')
      setNavidromeStats(statsResult.status === 'fulfilled' ? statsResult.value : 'not_configured')
      setNowPlaying(nowPlayingResult.status === 'fulfilled' ? nowPlayingResult.value : 'not_configured')
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <LoadingBlock />

  const errorCount = backlogItems.filter((i) => i.status === 'error').length

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tableau de bord</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardCard title="Sorties de la semaine">
          {upcomingReleases.length > 0 ? (
            <div className="flex flex-col gap-2">
              {upcomingReleases.map((r) => (
                <Link
                  key={r.id}
                  to={`/artists/${r.artist_id}`}
                  className="flex items-center gap-2 hover:bg-neutral-800 rounded-md px-1 py-1 -mx-1"
                >
                  {r.cover_url ? (
                    <img src={r.cover_url} alt="" className="w-8 h-8 rounded object-cover bg-neutral-800 shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      <span className="font-medium">{r.artist_name}</span> - {r.title}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {RELEASE_TYPE_LABELS[r.release_type]} · {r.release_date}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Aucune sortie prevue cette semaine.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="Backlog"
          action={
            <Link to="/backlog" className="text-xs text-purple-400 hover:underline">
              Voir tout →
            </Link>
          }
        >
          {backlogItems.length > 0 ? (
            <div>
              <p className="text-2xl font-semibold">{backlogItems.length}</p>
              <p className="text-sm text-neutral-500">
                fichier{backlogItems.length > 1 ? 's' : ''} en attente
                {errorCount > 0 && <span className="text-red-400"> - {errorCount} en erreur</span>}
              </p>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Rien a traiter pour le moment.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="Telechargements recents"
          action={
            <Link to="/metube" className="text-xs text-purple-400 hover:underline">
              Voir tout →
            </Link>
          }
        >
          {recentDownloads === 'not_configured' ? (
            <ConfigHint text="MeTube n'est pas configure." />
          ) : recentDownloads.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {recentDownloads.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{item.title ?? item.filename ?? item.url}</span>
                  <span
                    className={`text-xs whitespace-nowrap ${
                      item.status === 'finished' ? 'text-green-400' : item.status === 'error' ? 'text-red-400' : 'text-neutral-500'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Aucun telechargement recent.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="Navidrome"
          action={
            <Link to="/navidrome" className="text-xs text-purple-400 hover:underline">
              Voir tout →
            </Link>
          }
        >
          {navidromeStats === 'not_configured' ? (
            <ConfigHint text="Navidrome n'est pas configure." />
          ) : navidromeStats ? (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-semibold">{navidromeStats.artist_count}</p>
                <p className="text-xs text-neutral-500">artistes</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{navidromeStats.album_count}</p>
                <p className="text-xs text-neutral-500">albums</p>
              </div>
              <p className={`text-sm font-medium ${navidromeStats.scanning ? 'text-blue-300' : 'text-green-300'}`}>
                {navidromeStats.scanning ? 'Scan en cours...' : 'A jour'}
              </p>
            </div>
          ) : null}
        </DashboardCard>

        <DashboardCard title="Activite d'ecoute">
          {nowPlaying === 'not_configured' ? (
            <ConfigHint text="Navidrome n'est pas configure." />
          ) : nowPlaying.length > 0 ? (
            <div className="flex flex-col gap-2">
              {nowPlaying.map((entry, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-medium">{entry.title ?? 'Titre inconnu'}</span>
                  {entry.artist && <span className="text-neutral-400"> - {entry.artist}</span>}
                  {entry.username && <div className="text-xs text-neutral-500">{entry.username}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Personne n'ecoute quoi que ce soit en ce moment.</p>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
