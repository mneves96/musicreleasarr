import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  getReleaseTypeLabels,
  navidromeCoverArtUrl,
  type MetubeHistory,
  type NavidromeStats,
  type NowPlayingEntry,
  type RecentlyAddedAlbum,
  type RedditPost,
  type Release,
  type ScrobblingStats,
  type TaggingItem,
} from '../api'
import { LoadingBlock } from '../components/Spinner'
import { ArtistsIcon } from '../components/NavIcons'
import DownloadGlyph from '../components/DownloadGlyph'
import { AlbumIcon, CheckCircleIcon, ClockIcon, ErrorCircleIcon, GenreIcon, ScrobbleIcon, TrackIcon } from '../components/DashboardIcons'
import { useLanguage } from '../context/LanguageContext'

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
  const { t } = useLanguage()
  return (
    <p className="text-sm text-app-text-faint">
      {text} {t('dashboard.configHintPrefix')}{' '}
      <Link to="/settings" className="text-app-accent-text hover:underline">
        {t('common.settings')}
      </Link>
      .
    </p>
  )
}

function ReleaseListWidget({ releases, emptyText }: { releases: Release[]; emptyText: string }) {
  const { t } = useLanguage()
  const releaseTypeLabels = getReleaseTypeLabels(t)
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
              {releaseTypeLabels[r.release_type]} · {r.release_date}
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
  const { t } = useLanguage()
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
            <div className="text-xs text-app-text-faint">
              {t('dashboard.addedOn', { date: a.created ? a.created.slice(0, 10) : '?' })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Les posts viennent du flux RSS public de r/navidrome (voir
// services/reddit.py cote backend) - toujours en anglais, Reddit ne propose
// pas de traduction automatique via son API publique, contrairement a la
// traduction affichee sur le site pour un visiteur connecte.
function RedditWidget({ posts, emptyText }: { posts: RedditPost[]; emptyText: string }) {
  const { t, language } = useLanguage()
  const localeTag = language === 'fr' ? 'fr-FR' : 'en-US'
  if (posts.length === 0) return <p className="text-sm text-app-text-faint">{emptyText}</p>
  return (
    <div className="flex flex-col gap-3">
      {posts.map((p) => (
        <a
          key={p.url ?? p.title}
          href={p.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="block hover:bg-app-surface-hover rounded-md px-1 py-1 -mx-1"
        >
          <p className="text-sm font-medium truncate">{p.title}</p>
          {p.preview && <p className="text-xs text-app-text-muted mt-0.5 line-clamp-2">{p.preview}</p>}
          <p className="text-xs text-app-text-faint mt-1">
            {t('dashboard.redditByOn', {
              author: p.author,
              date: p.published_at ? new Date(p.published_at).toLocaleDateString(localeTag) : '?',
            })}
          </p>
        </a>
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
  const { t, language } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [recentReleases, setRecentReleases] = useState<Release[]>([])
  const [upcomingReleases, setUpcomingReleases] = useState<Release[]>([])
  const [backlogItems, setBacklogItems] = useState<TaggingItem[]>([])
  const [recentlyAdded, setRecentlyAdded] = useState<RecentlyAddedAlbum[] | 'not_configured'>([])
  const [metubeHistory, setMetubeHistory] = useState<MetubeHistory | 'not_configured'>('not_configured')
  const [navidromeStats, setNavidromeStats] = useState<NavidromeStats | 'not_configured' | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[] | 'not_configured'>([])
  const [scrobbling, setScrobbling] = useState<ScrobblingStats | null>(null)
  const [redditPosts, setRedditPosts] = useState<RedditPost[] | 'unavailable'>([])

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
        redditResult,
      ] = await Promise.allSettled([
        api.listReleases({ to: toISODate(today), limit: 5, order: 'desc' }),
        api.listReleases({ from: toISODate(today), limit: 5, order: 'asc' }),
        api.tagging.backlog(),
        api.navidromeRecentlyAdded(),
        api.metubeHistory(),
        api.navidromeStats(),
        api.navidromeNowPlaying(),
        api.scrobblingStats(),
        api.redditNavidromePosts(),
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
      setRedditPosts(redditResult.status === 'fulfilled' ? redditResult.value : 'unavailable')
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

  const localeTag = language === 'fr' ? 'fr-FR' : 'en-US'

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{t('dashboard.title')}</h1>

      <div className="mb-4">
        <DashboardCard
          title="Navidrome"
          action={
            <Link to="/navidrome" className="text-xs text-app-accent-text hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {navidromeStats === 'not_configured' ? (
            <ConfigHint text={t('dashboard.navidromeNotConfigured')} />
          ) : navidromeStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <ArtistsIcon className="w-5 h-5 text-app-text-faint shrink-0" />
                  <div>
                    <p className="text-lg font-semibold leading-none">{navidromeStats.artist_count}</p>
                    <p className="text-xs text-app-text-faint">{t('dashboard.artists')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlbumIcon className="w-5 h-5 text-app-text-faint shrink-0" />
                  <div>
                    <p className="text-lg font-semibold leading-none">{navidromeStats.album_count}</p>
                    <p className="text-xs text-app-text-faint">{t('dashboard.albums')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrackIcon className="w-5 h-5 text-app-text-faint shrink-0" />
                  <div>
                    <p className="text-lg font-semibold leading-none">{navidromeStats.song_count}</p>
                    <p className="text-xs text-app-text-faint">{t('dashboard.tracks')}</p>
                  </div>
                </div>
              </div>

              {navidromeStats.top_genres.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-app-text-faint mb-1.5">
                    <GenreIcon className="w-3.5 h-3.5" />
                    {t('dashboard.topGenres')}
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
                  <div className="text-xs text-app-text-faint mb-1.5">{t('dashboard.activeSessions')}</div>
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
                            <span className="font-medium">{entry.title ?? t('dashboard.unknownTitle')}</span>
                            {entry.artist && <span className="text-app-text-muted"> - {entry.artist}</span>}
                          </div>
                          {entry.username && <div className="text-xs text-app-text-faint truncate">{entry.username}</div>}
                        </div>
                        <span className="equalizer-bars shrink-0" title={t('dashboard.nowPlayingTitle')}>
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
        <DashboardCard title={t('dashboard.recentReleases')}>
          <ReleaseListWidget releases={recentReleases} emptyText={t('dashboard.noRecentRelease')} />
        </DashboardCard>

        <DashboardCard title={t('dashboard.upcomingReleases')}>
          <ReleaseListWidget releases={upcomingReleases} emptyText={t('dashboard.noUpcomingRelease')} />
        </DashboardCard>

        <DashboardCard
          title="Backlog"
          action={
            <Link to="/backlog" className="text-xs text-app-accent-text hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {backlogItems.length > 0 ? (
            <div>
              <p className="text-2xl font-semibold">{backlogItems.length}</p>
              <p className="text-sm text-app-text-faint">
                {t('dashboard.backlogPending', { count: backlogItems.length })}
                {errorCount > 0 && <span className="text-red-400">{t('dashboard.filesError', { count: errorCount })}</span>}
              </p>
            </div>
          ) : (
            <p className="text-sm text-app-text-faint">{t('dashboard.nothingToProcess')}</p>
          )}
        </DashboardCard>

        <DashboardCard
          title={t('dashboard.recentAdditions')}
          action={
            <Link to="/navidrome" className="text-xs text-app-accent-text hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {recentlyAdded === 'not_configured' ? (
            <ConfigHint text={t('dashboard.navidromeNotConfigured')} />
          ) : (
            <RecentlyAddedWidget albums={recentlyAdded} emptyText={t('dashboard.noRecentAlbum')} />
          )}
        </DashboardCard>

        <DashboardCard
          title="MeTube"
          action={
            <Link to="/metube" className="text-xs text-app-accent-text hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          }
        >
          {metubeCounts === null ? (
            <ConfigHint text={t('dashboard.metubeNotConfigured')} />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <MetubeStatTile
                icon={<ClockIcon className="w-5 h-5" />}
                count={metubeCounts.pending}
                label={t('dashboard.metubePending')}
                colorClass="text-app-text-faint"
              />
              <MetubeStatTile
                icon={<DownloadGlyph className="w-5 h-5" />}
                count={metubeCounts.inProgress}
                label={t('dashboard.metubeInProgress')}
                colorClass="text-blue-400"
              />
              <MetubeStatTile
                icon={<CheckCircleIcon className="w-5 h-5" />}
                count={metubeCounts.done}
                label={t('dashboard.metubeSucceeded')}
                colorClass="text-green-400"
              />
              <MetubeStatTile
                icon={<ErrorCircleIcon className="w-5 h-5" />}
                count={metubeCounts.error}
                label={t('dashboard.metubeFailed')}
                colorClass="text-red-400"
              />
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Scrobbling">
          {!scrobbling || (!scrobbling.lastfm && !scrobbling.listenbrainz) ? (
            <ConfigHint text={t('dashboard.scrobblingNotConnected')} />
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
                    <p className="text-lg font-semibold leading-none">
                      {scrobbling.lastfm.playcount.toLocaleString(localeTag)}
                    </p>
                    <p className="text-xs text-app-text-faint truncate">
                      {t('dashboard.lastfmScrobbles', { username: scrobbling.lastfm.username })}
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
                      {scrobbling.listenbrainz.listen_count.toLocaleString(localeTag)}
                    </p>
                    <p className="text-xs text-app-text-faint truncate">
                      {t('dashboard.listenbrainzListens', { username: scrobbling.listenbrainz.username })}
                    </p>
                  </div>
                </a>
              )}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="r/navidrome"
          action={
            <a
              href="https://www.reddit.com/r/navidrome/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-app-accent-text hover:underline"
            >
              {t('dashboard.redditViewOnReddit')}
            </a>
          }
        >
          {redditPosts === 'unavailable' ? (
            <p className="text-sm text-app-text-faint">{t('dashboard.redditUnavailable')}</p>
          ) : (
            <RedditWidget posts={redditPosts} emptyText={t('dashboard.redditNoPosts')} />
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
