import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  navidromeCoverArtUrl,
  RELEASE_TYPE_LABELS,
  type MetubeItem,
  type NavidromeStats,
  type NowPlayingEntry,
  type Release,
  type TaggingItem,
} from '../api'
import { LoadingBlock } from '../components/Spinner'
import { ArtistsIcon } from '../components/NavIcons'
import { AlbumIcon, GenreIcon, TrackIcon } from '../components/DashboardIcons'

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function DashboardCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-4">
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
    <p className="text-sm text-app-text-faint">
      {text} Configure ca dans{' '}
      <Link to="/settings" className="text-app-accent-text hover:underline">
        Reglages
      </Link>
      .
    </p>
  )
}

function ReleaseListWidget({ releases, emptyText }: { releases: Release[]; emptyText: string }) {
  if (releases.length === 0) return <p className="text-sm text-app-text-faint">{emptyText}</p>
  return (
    <div className="flex flex-col gap-2">
      {releases.map((r) => (
        <Link
          key={r.id}
          to={`/artists/${r.artist_id}`}
          className="flex items-center gap-2 hover:bg-app-surface-hover rounded-md px-1 py-1 -mx-1"
        >
          {r.cover_url ? (
            <img src={r.cover_url} alt="" className="w-8 h-8 rounded object-cover bg-app-surface-hover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded bg-app-surface-hover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">
              <span className="font-medium">{r.artist_name}</span> - {r.title}
            </div>
            <div className="text-xs text-app-text-faint">
              {RELEASE_TYPE_LABELS[r.release_type]} · {r.release_date}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// Page d'accueil "mission control" : agrege des donnees deja exposees par
// d'autres onglets (sorties, backlog, MeTube, Navidrome) sur une seule vue.
// Chaque widget se degrade silencieusement (ConfigHint) si le service
// correspondant n'est pas configure.
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [recentReleases, setRecentReleases] = useState<Release[]>([])
  const [upcomingReleases, setUpcomingReleases] = useState<Release[]>([])
  const [backlogItems, setBacklogItems] = useState<TaggingItem[]>([])
  const [recentDownloads, setRecentDownloads] = useState<MetubeItem[] | 'not_configured'>([])
  const [navidromeStats, setNavidromeStats] = useState<NavidromeStats | 'not_configured' | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[] | 'not_configured'>([])

  useEffect(() => {
    let cancelled = false

    const today = new Date()

    async function load() {
      const [recentResult, upcomingResult, backlogResult, metubeResult, statsResult, nowPlayingResult] = await Promise.allSettled([
        api.listReleases({ to: toISODate(today), limit: 5, order: 'desc' }),
        api.listReleases({ from: toISODate(today), limit: 5, order: 'asc' }),
        api.tagging.backlog(),
        api.metubeHistory(),
        api.navidromeStats(),
        api.navidromeNowPlaying(),
      ])
      if (cancelled) return

      setRecentReleases(recentResult.status === 'fulfilled' ? recentResult.value.results : [])
      setUpcomingReleases(upcomingResult.status === 'fulfilled' ? upcomingResult.value.results : [])
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

      <div className="mb-4">
        <DashboardCard
          title="Navidrome"
          action={
            <Link to="/navidrome" className="text-xs text-app-accent-text hover:underline">
              Voir tout →
            </Link>
          }
        >
          {navidromeStats === 'not_configured' ? (
            <ConfigHint text="Navidrome n'est pas configure." />
          ) : navidromeStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <ArtistsIcon className="w-5 h-5 text-app-text-faint shrink-0" />
                  <div>
                    <p className="text-lg font-semibold leading-none">{navidromeStats.artist_count}</p>
                    <p className="text-xs text-app-text-faint">artistes</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlbumIcon className="w-5 h-5 text-app-text-faint shrink-0" />
                  <div>
                    <p className="text-lg font-semibold leading-none">{navidromeStats.album_count}</p>
                    <p className="text-xs text-app-text-faint">albums</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrackIcon className="w-5 h-5 text-app-text-faint shrink-0" />
                  <div>
                    <p className="text-lg font-semibold leading-none">{navidromeStats.song_count}</p>
                    <p className="text-xs text-app-text-faint">titres</p>
                  </div>
                </div>
              </div>

              {navidromeStats.top_genres.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-app-text-faint mb-1.5">
                    <GenreIcon className="w-3.5 h-3.5" />
                    Genres les plus representes
                  </div>
                  <div className="flex flex-col gap-1">
                    {navidromeStats.top_genres.map((g) => (
                      <div key={g.name} className="flex items-center gap-2 text-xs">
                        <span className="w-20 truncate text-app-text-muted shrink-0">{g.name}</span>
                        <div className="flex-1 h-1.5 bg-app-surface-hover rounded-full overflow-hidden">
                          <div className="h-full bg-app-accent" style={{ width: `${g.percent}%` }} />
                        </div>
                        <span className="text-app-text-faint shrink-0 whitespace-nowrap">
                          {g.percent}% · {g.song_count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {nowPlaying !== 'not_configured' && nowPlaying.length > 0 && (
                <div>
                  <div className="text-xs text-app-text-faint mb-1.5">Sessions en cours</div>
                  <div className="flex flex-col gap-2">
                    {nowPlaying.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {entry.cover_art_id ? (
                          <img
                            src={navidromeCoverArtUrl(entry.cover_art_id)}
                            alt=""
                            className="w-9 h-9 rounded object-cover bg-app-surface-hover shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded bg-app-surface-hover flex items-center justify-center text-sm shrink-0">🎧</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">
                            <span className="font-medium">{entry.title ?? 'Titre inconnu'}</span>
                            {entry.artist && <span className="text-app-text-muted"> - {entry.artist}</span>}
                          </div>
                          {entry.username && <div className="text-xs text-app-text-faint truncate">{entry.username}</div>}
                        </div>
                        <span className="equalizer-bars shrink-0" title="Lecture en cours">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <DashboardCard title="Sorties recentes">
          <ReleaseListWidget releases={recentReleases} emptyText="Aucune sortie recente." />
        </DashboardCard>

        <DashboardCard title="Sorties a venir">
          <ReleaseListWidget releases={upcomingReleases} emptyText="Aucune sortie prevue." />
        </DashboardCard>

        <DashboardCard
          title="Backlog"
          action={
            <Link to="/backlog" className="text-xs text-app-accent-text hover:underline">
              Voir tout →
            </Link>
          }
        >
          {backlogItems.length > 0 ? (
            <div>
              <p className="text-2xl font-semibold">{backlogItems.length}</p>
              <p className="text-sm text-app-text-faint">
                fichier{backlogItems.length > 1 ? 's' : ''} en attente
                {errorCount > 0 && <span className="text-red-400"> - {errorCount} en erreur</span>}
              </p>
            </div>
          ) : (
            <p className="text-sm text-app-text-faint">Rien a traiter pour le moment.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="Telechargements recents"
          action={
            <Link to="/metube" className="text-xs text-app-accent-text hover:underline">
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
                      item.status === 'finished' ? 'text-green-400' : item.status === 'error' ? 'text-red-400' : 'text-app-text-faint'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-app-text-faint">Aucun telechargement recent.</p>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
