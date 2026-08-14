import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  navidromeCoverArtUrl,
  RELEASE_TYPE_LABELS,
  type MetubeHistory,
  type NavidromeStats,
  type NowPlayingEntry,
  type RecentlyAddedAlbum,
  type Release,
  type ScrobblingStats,
  type TaggingItem,
} from '../api'
import { LoadingBlock } from '../components/Spinner'
import { ArtistsIcon } from '../components/NavIcons'
import DownloadGlyph from '../components/DownloadGlyph'
import { AlbumIcon, CheckCircleIcon, ClockIcon, ErrorCircleIcon, GenreIcon, ScrobbleIcon, TrackIcon } from '../components/DashboardIcons'

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

// Meme presentation que ReleaseListWidget ci-dessus (cover + ligne principale
// + sous-ligne), mais sans lien cliquable : un album Navidrome n'a pas
// forcement de fiche artiste correspondante cote app (aucun artist_id fiable
// vers lequel naviguer), contrairement a une Release.
function RecentlyAddedWidget({ albums, emptyText }: { albums: RecentlyAddedAlbum[]; emptyText: string }) {
  if (albums.length === 0) return <p className="text-sm text-app-text-faint">{emptyText}</p>
  return (
    <div className="flex flex-col gap-2">
      {albums.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-md px-1 py-1 -mx-1">
          {a.cover_art_id ? (
            <img
              src={navidromeCoverArtUrl(a.cover_art_id)}
              alt=""
              className="w-8 h-8 rounded object-cover bg-app-surface-hover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-app-surface-hover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">
              {a.artist && <span className="font-medium">{a.artist} - </span>}
              {a.name}
            </div>
            <div className="text-xs text-app-text-faint">Ajoute le {a.created ? a.created.slice(0, 10) : '?'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

type MetubeCounts = { pending: number; inProgress: number; done: number; error: number }

function MetubeStatTile({
  icon,
  count,
  label,
  colorClass,
}: {
  icon: ReactNode
  count: number
  label: string
  colorClass: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={colorClass}>{icon}</span>
      <div>
        <p className={`text-lg font-semibold leading-none ${colorClass}`}>{count}</p>
        <p className="text-xs text-app-text-faint">{label}</p>
      </div>
    </div>
  )
}

// Page d'accueil "mission control" : agrege des donnees deja exposees par
// d'autres onglets (sorties, backlog, MeTube, Navidrome, scrobbling) sur une
// seule vue. Chaque widget se degrade silencieusement (ConfigHint) si le
// service correspondant n'est pas configure.
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [recentReleases, setRecentReleases] = useState<Release[]>([])
  const [upcomingReleases, setUpcomingReleases] = useState<Release[]>([])
  const [backlogItems, setBacklogItems] = useState<TaggingItem[]>([])
  const [recentlyAdded, setRecentlyAdded] = useState<RecentlyAddedAlbum[] | 'not_configured'>([])
  const [metubeHistory, setMetubeHistory] = useState<MetubeHistory | 'not_configured'>('not_configured')
  const [navidromeStats, setNavidromeStats] = useState<NavidromeStats | 'not_configured' | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[] | 'not_configured'>([])
  const [scrobbling, setScrobbling] = useState<ScrobblingStats | null>(null)

  useEffect(() => {
    let cancelled = false

    const today = new Date()

    async function load() {
      const [
        recentResult,
        upcomingResult,
        backlogResult,
        recentlyAddedResult,
        metubeResult,
        statsResult,
        nowPlayingResult,
        scrobblingResult,
      ] = await Promise.allSettled([
        api.listReleases({ to: toISODate(today), limit: 5, order: 'desc' }),
        api.listReleases({ from: toISODate(today), limit: 5, order: 'asc' }),
        api.tagging.backlog(),
        api.navidromeRecentlyAdded(),
        api.metubeHistory(),
        api.navidromeStats(),
        api.navidromeNowPlaying(),
        api.scrobblingStats(),
      ])
      if (cancelled) return

      setRecentReleases(recentResult.status === 'fulfilled' ? recentResult.value.results : [])
      setUpcomingReleases(upcomingResult.status === 'fulfilled' ? upcomingResult.value.results : [])
      setBacklogItems(backlogResult.status === 'fulfilled' ? backlogResult.value : [])
      setRecentlyAdded(recentlyAddedResult.status === 'fulfilled' ? recentlyAddedResult.value : 'not_configured')
      setMetubeHistory(metubeResult.status === 'fulfilled' ? metubeResult.value : 'not_configured')
      setNavidromeStats(statsResult.status === 'fulfilled' ? statsResult.value : 'not_configured')
      setNowPlaying(nowPlayingResult.status === 'fulfilled' ? nowPlayingResult.value : 'not_configured')
      setScrobbling(scrobblingResult.status === 'fulfilled' ? scrobblingResult.value : null)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <LoadingBlock />

  const errorCount = backlogItems.filter((i) => i.status === 'error').length

  const metubeCounts: MetubeCounts | null =
    metubeHistory === 'not_configured'
      ? null
      : [...metubeHistory.queue, ...metubeHistory.pending, ...metubeHistory.done].reduce(
          (acc, item) => {
            if (item.status === 'pending' || item.status === 'scheduled') acc.pending += 1
            else if (item.status === 'preparing' || item.status === 'downloading') acc.inProgress += 1
            else if (item.status === 'finished') acc.done += 1
            else if (item.status === 'error') acc.error += 1
            return acc
          },
          { pending: 0, inProgress: 0, done: 0, error: 0 }
        )

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
          title="Ajouts recents"
          action={
            <Link to="/navidrome" className="text-xs text-app-accent-text hover:underline">
              Voir tout →
            </Link>
          }
        >
          {recentlyAdded === 'not_configured' ? (
            <ConfigHint text="Navidrome n'est pas configure." />
          ) : (
            <RecentlyAddedWidget albums={recentlyAdded} emptyText="Aucun album ajoute recemment." />
          )}
        </DashboardCard>

        <DashboardCard
          title="MeTube"
          action={
            <Link to="/metube" className="text-xs text-app-accent-text hover:underline">
              Voir tout →
            </Link>
          }
        >
          {metubeCounts === null ? (
            <ConfigHint text="MeTube n'est pas configure." />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <MetubeStatTile
                icon={<ClockIcon className="w-5 h-5" />}
                count={metubeCounts.pending}
                label="en attente"
                colorClass="text-app-text-faint"
              />
              <MetubeStatTile
                icon={<DownloadGlyph className="w-5 h-5" />}
                count={metubeCounts.inProgress}
                label="en cours"
                colorClass="text-blue-400"
              />
              <MetubeStatTile
                icon={<CheckCircleIcon className="w-5 h-5" />}
                count={metubeCounts.done}
                label="reussis"
                colorClass="text-green-400"
              />
              <MetubeStatTile
                icon={<ErrorCircleIcon className="w-5 h-5" />}
                count={metubeCounts.error}
                label="en erreur"
                colorClass="text-red-400"
              />
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Scrobbling">
          {!scrobbling || (!scrobbling.lastfm && !scrobbling.listenbrainz) ? (
            <ConfigHint text="Ni Last.fm ni ListenBrainz ne sont connectes." />
          ) : (
            <div className="flex flex-col gap-3">
              {scrobbling.lastfm && (
                <a
                  href={scrobbling.lastfm.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 hover:bg-app-surface-hover rounded-md px-1 py-1 -mx-1"
                >
                  <ScrobbleIcon className="w-6 h-6 text-red-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-none">{scrobbling.lastfm.playcount.toLocaleString()}</p>
                    <p className="text-xs text-app-text-faint truncate">
                      scrobbles Last.fm · {scrobbling.lastfm.username}
                    </p>
                  </div>
                </a>
              )}
              {scrobbling.listenbrainz && (
                <a
                  href={`https://listenbrainz.org/user/${encodeURIComponent(scrobbling.listenbrainz.username)}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 hover:bg-app-surface-hover rounded-md px-1 py-1 -mx-1"
                >
                  <ScrobbleIcon className="w-6 h-6 text-orange-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-none">
                      {scrobbling.listenbrainz.listen_count.toLocaleString()}
                    </p>
                    <p className="text-xs text-app-text-faint truncate">
                      ecoutes ListenBrainz · {scrobbling.listenbrainz.username}
                    </p>
                  </div>
                </a>
              )}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
