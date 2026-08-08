import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api,
  navidromeCoverArtUrl,
  RELEASE_TYPE_LABELS,
  type Favorites,
  type FavoritesPeriod,
  type MetubeItem,
  type NavidromeStats,
  type NowPlayingEntry,
  type Release,
  type TaggingItem,
} from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'
import { ArtistsIcon } from '../components/NavIcons'
import { AlbumIcon, ClockIcon, GenreIcon, TrackIcon } from '../components/DashboardIcons'

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

const PERIOD_LABELS: Record<FavoritesPeriod, string> = {
  week: 'Cette semaine',
  month: 'Ce mois',
  year: 'Cette annee',
}

function PeriodTabs({ value, onChange }: { value: FavoritesPeriod; onChange: (p: FavoritesPeriod) => void }) {
  return (
    <div className="flex gap-1">
      {(Object.keys(PERIOD_LABELS) as FavoritesPeriod[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`text-xs px-2.5 py-1 rounded-full border ${
            value === p
              ? 'bg-app-accent border-app-accent'
              : 'bg-app-surface-hover border-app-border-strong text-app-text-muted'
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

function playcountLabel(n: number): string {
  return `${n} ecoute${n > 1 ? 's' : ''}`
}

// Ligne "artiste/album/piste prefere" partagee par les 3 cartes de favoris -
// cliquable vers la fiche artiste (POST /artists/preview + navigation, meme
// flux que SearchPage.tsx/SimilarArtistsSection.tsx) quand un mbid a pu etre
// resolu cote backend, simplement affichee sinon.
function FavoriteEntry({
  image,
  fallback,
  rounded,
  title,
  subtitle,
  meta,
  clickable,
  busy,
  onClick,
}: {
  image: string | null
  fallback: string
  rounded?: boolean
  title: string
  subtitle?: string | null
  meta?: string | null
  clickable: boolean
  busy: boolean
  onClick: () => void
}) {
  const shape = rounded ? 'rounded-full' : 'rounded'
  const content = (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        {image ? (
          <img src={image} alt="" className={`w-14 h-14 object-cover bg-app-surface-hover ${shape}`} />
        ) : (
          <span className={`flex w-14 h-14 items-center justify-center bg-app-surface-hover text-xl ${shape}`}>{fallback}</span>
        )}
        {busy && (
          <span className={`absolute inset-0 flex items-center justify-center bg-black/50 ${shape}`}>
            <Spinner className="w-5 h-5 text-white" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className={`font-medium truncate ${clickable ? 'hover:underline' : ''}`}>{title}</div>
        {subtitle && <div className="text-xs text-app-text-muted truncate">{subtitle}</div>}
        {meta && <div className="text-xs text-app-text-faint truncate">{meta}</div>}
      </div>
    </div>
  )
  if (!clickable) return content
  return (
    <button onClick={onClick} disabled={busy} className="w-full disabled:opacity-70">
      {content}
    </button>
  )
}

// Page d'accueil "mission control" : agrege des donnees deja exposees par
// d'autres onglets (sorties, backlog, MeTube, Navidrome) ainsi que des
// favoris d'ecoute Last.fm (voir routers/stats.py - Navidrome seul ne garde
// pas d'historique horodate, aucune stat par periode n'est calculable sans
// lui) sur une seule vue. Chaque widget se degrade silencieusement
// (ConfigHint) si le service correspondant n'est pas configure.
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [recentReleases, setRecentReleases] = useState<Release[]>([])
  const [upcomingReleases, setUpcomingReleases] = useState<Release[]>([])
  const [backlogItems, setBacklogItems] = useState<TaggingItem[]>([])
  const [recentDownloads, setRecentDownloads] = useState<MetubeItem[] | 'not_configured'>([])
  const [navidromeStats, setNavidromeStats] = useState<NavidromeStats | 'not_configured' | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlayingEntry[] | 'not_configured'>([])

  const [favoritesPeriod, setFavoritesPeriod] = useState<FavoritesPeriod>('week')
  const [favorites, setFavorites] = useState<Favorites | 'not_configured' | null>(null)
  const [favoritesLoading, setFavoritesLoading] = useState(true)
  const [openingMbid, setOpeningMbid] = useState<string | null>(null)
  const navigate = useNavigate()

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

  useEffect(() => {
    let cancelled = false
    setFavoritesLoading(true)
    api
      .getFavorites(favoritesPeriod)
      .then((data) => {
        if (!cancelled) setFavorites(data)
      })
      .catch(() => {
        if (!cancelled) setFavorites('not_configured')
      })
      .finally(() => {
        if (!cancelled) setFavoritesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [favoritesPeriod])

  async function openArtist(mbid: string | null) {
    if (!mbid) return
    setOpeningMbid(mbid)
    try {
      const artist = await api.previewArtist(mbid)
      navigate(`/artists/${artist.id}`)
    } catch {
      setOpeningMbid(null)
    }
  }

  if (loading) return <LoadingBlock />

  const errorCount = backlogItems.filter((i) => i.status === 'error').length

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tableau de bord</h1>
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
            <div className="flex flex-col gap-4">
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

              <div>
                <div className="flex items-center gap-1.5 text-xs text-app-text-faint mb-1.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                  Heures d'ecoute (estimation)
                </div>
                {favorites === 'not_configured' ? (
                  <p className="text-xs text-app-text-faint">Connecte Last.fm dans Reglages pour cette stat.</p>
                ) : favoritesLoading ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <p className="text-lg font-semibold leading-none">
                    {favorites?.estimated_hours != null ? `~${favorites.estimated_hours} h` : '—'}
                  </p>
                )}
              </div>

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

      <div className="flex items-center justify-between mt-6 mb-3 flex-wrap gap-2">
        <h2 className="font-medium">Favoris d'ecoute (Last.fm)</h2>
        <PeriodTabs value={favoritesPeriod} onChange={setFavoritesPeriod} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <DashboardCard title="Artiste prefere">
          {favorites === 'not_configured' ? (
            <ConfigHint text="Last.fm n'est pas connecte." />
          ) : favoritesLoading ? (
            <Spinner className="w-4 h-4" />
          ) : favorites?.top_artist ? (
            <FavoriteEntry
              rounded
              image={favorites.top_artist.image_url}
              fallback="🎤"
              title={favorites.top_artist.name}
              subtitle={[favorites.top_artist.area_name, favorites.top_artist.country].filter(Boolean).join(', ') || null}
              meta={playcountLabel(favorites.top_artist.playcount)}
              clickable={!!favorites.top_artist.musicbrainz_id}
              busy={openingMbid === favorites.top_artist.musicbrainz_id}
              onClick={() => openArtist(favorites.top_artist!.musicbrainz_id)}
            />
          ) : (
            <p className="text-sm text-app-text-faint">Aucune donnee pour cette periode.</p>
          )}
        </DashboardCard>

        <DashboardCard title="Album prefere">
          {favorites === 'not_configured' ? (
            <ConfigHint text="Last.fm n'est pas connecte." />
          ) : favoritesLoading ? (
            <Spinner className="w-4 h-4" />
          ) : favorites?.top_album ? (
            <FavoriteEntry
              image={favorites.top_album.image_url}
              fallback="💿"
              title={favorites.top_album.name}
              subtitle={
                [favorites.top_album.artist_name, favorites.top_album.release_date?.slice(0, 4)].filter(Boolean).join(' · ') || null
              }
              meta={playcountLabel(favorites.top_album.playcount)}
              clickable={!!favorites.top_album.artist_musicbrainz_id}
              busy={openingMbid === favorites.top_album.artist_musicbrainz_id}
              onClick={() => openArtist(favorites.top_album!.artist_musicbrainz_id)}
            />
          ) : (
            <p className="text-sm text-app-text-faint">Aucune donnee pour cette periode.</p>
          )}
        </DashboardCard>

        <DashboardCard title="Piste preferee">
          {favorites === 'not_configured' ? (
            <ConfigHint text="Last.fm n'est pas connecte." />
          ) : favoritesLoading ? (
            <Spinner className="w-4 h-4" />
          ) : favorites?.top_track ? (
            <FavoriteEntry
              image={favorites.top_track.cover_url}
              fallback="🎧"
              title={favorites.top_track.name}
              subtitle={[favorites.top_track.artist_name, favorites.top_track.album_title].filter(Boolean).join(' - ') || null}
              meta={
                favorites.top_track.estimated_hours != null
                  ? `~${favorites.top_track.estimated_hours} h d'ecoute`
                  : playcountLabel(favorites.top_track.playcount)
              }
              clickable={!!favorites.top_track.artist_musicbrainz_id}
              busy={openingMbid === favorites.top_track.artist_musicbrainz_id}
              onClick={() => openArtist(favorites.top_track!.artist_musicbrainz_id)}
            />
          ) : (
            <p className="text-sm text-app-text-faint">Aucune donnee pour cette periode.</p>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
