import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type LyricsErrorGroup, type LyricsJob, type LyricsStats, type LyricsStatus, type LyricsTrack } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'
import { useLanguage } from '../context/LanguageContext'
import type { TranslationKey } from '../i18n/en'

const JOB_POLL_MS = 1500
const TRACKS_PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 300

const STATUS_STYLES: Record<LyricsStatus, { bar: string; text: string; key: TranslationKey }> = {
  missing: { bar: 'bg-red-500', text: 'text-red-300', key: 'lyrics.stats.missing' },
  plain: { bar: 'bg-amber-500', text: 'text-amber-300', key: 'lyrics.stats.plain' },
  synced: { bar: 'bg-green-500', text: 'text-green-300', key: 'lyrics.stats.synced' },
}
const STATUSES: LyricsStatus[] = ['missing', 'plain', 'synced']
// Filtre de la liste des titres : un statut de paroles, tous, ou les titres
// dont la derniere recherche lrclib a echoue.
type TrackFilter = LyricsStatus | 'all' | 'errors'
const TRACK_FILTERS: TrackFilter[] = ['all', ...STATUSES, 'errors']

const LOOKUP_KEYS: Record<string, TranslationKey> = {
  not_found: 'lyrics.lookup.not_found',
  no_tags: 'lyrics.lookup.no_tags',
  error: 'lyrics.lookup.error',
}

function percent(count: number, total: number): string {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : '-'
}

function StatCard({ label, value, sub, className = '' }: { label: string; value: number | undefined; sub?: string; className?: string }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-4">
      <div className="text-xs text-app-text-faint mb-1">{label}</div>
      <div className={`text-lg font-semibold ${className}`}>{value ?? '-'}</div>
      {sub && <div className="text-xs text-app-text-faint">{sub}</div>}
    </div>
  )
}

export default function LyricsPage() {
  const { t, language } = useLanguage()
  const [stats, setStats] = useState<LyricsStats | null>(null)
  const [errorGroups, setErrorGroups] = useState<LyricsErrorGroup[]>([])
  const [job, setJob] = useState<LyricsJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retryAll, setRetryAll] = useState(false)

  const [filter, setFilter] = useState<TrackFilter>('missing')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [tracks, setTracks] = useState<LyricsTrack[]>([])
  const [tracksTotal, setTracksTotal] = useState(0)
  const [tracksLoading, setTracksLoading] = useState(false)
  const wasRunningRef = useRef(false)

  const loadStats = useCallback(
    () => Promise.all([api.lyrics.stats().then(setStats), api.lyrics.errors().then(setErrorGroups)]),
    [],
  )

  const loadTracks = useCallback(
    async (offset: number) => {
      setTracksLoading(true)
      try {
        const page = await api.lyrics.tracks({
          status: filter === 'all' || filter === 'errors' ? undefined : filter,
          errorsOnly: filter === 'errors',
          q: debouncedQuery || undefined,
          limit: TRACKS_PAGE_SIZE,
          offset,
        })
        setTracks((prev) => (offset === 0 ? page.items : [...prev, ...page.items]))
        setTracksTotal(page.total)
      } finally {
        setTracksLoading(false)
      }
    },
    [filter, debouncedQuery],
  )

  useEffect(() => {
    Promise.all([loadStats(), api.lyrics.job().then(setJob)])
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charge une seule fois au montage
  }, [loadStats])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    loadTracks(0).catch(() => {})
  }, [loadTracks])

  // Scan et mise a jour tournent en arriere-plan cote serveur : on sonde l'etat
  // du traitement tant qu'il tourne, puis on recharge stats + liste a la fin.
  const running = job?.running ?? false
  useEffect(() => {
    if (!running) return
    wasRunningRef.current = true
    const interval = window.setInterval(() => {
      api.lyrics
        .job()
        .then(setJob)
        .catch(() => {})
    }, JOB_POLL_MS)
    return () => window.clearInterval(interval)
  }, [running])

  useEffect(() => {
    if (running || !wasRunningRef.current) return
    wasRunningRef.current = false
    loadStats().catch(() => {})
    loadTracks(0).catch(() => {})
  }, [running, loadStats, loadTracks])

  async function start(action: () => Promise<LyricsJob>) {
    setActionError(null)
    try {
      setJob(await action())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  if (loading) return <LoadingBlock />
  if (error) return <p className="text-app-text-muted">{error}</p>

  const total = stats?.total ?? 0
  const localeTag = language === 'fr' ? 'fr-FR' : 'en-US'
  const lastScan = stats?.last_scan_at ? new Date(`${stats.last_scan_at}Z`).toLocaleString(localeTag) : null
  const progress = job && job.total > 0 ? (job.processed / job.total) * 100 : 0

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{t('lyrics.title')}</h1>
      <p className="text-sm text-app-text-muted mb-4">{t('lyrics.intro')}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <StatCard label={t('lyrics.stats.total')} value={stats?.total} />
        {STATUSES.map((status) => (
          <StatCard
            key={status}
            label={t(STATUS_STYLES[status].key)}
            value={stats?.[status]}
            sub={percent(stats?.[status] ?? 0, total)}
            className={STATUS_STYLES[status].text}
          />
        ))}
      </div>

      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-app-surface-hover mb-2">
          {STATUSES.map((status) => (
            <div
              key={status}
              className={STATUS_STYLES[status].bar}
              style={{ width: `${((stats?.[status] ?? 0) / total) * 100}%` }}
              title={`${t(STATUS_STYLES[status].key)} : ${stats?.[status] ?? 0}`}
            />
          ))}
        </div>
      )}
      <p className="text-xs text-app-text-faint mb-6">
        {lastScan ? t('lyrics.lastScan', { date: lastScan }) : t('lyrics.neverScanned')}
      </p>

      <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => start(() => api.lyrics.scan(false))}
            disabled={running}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
          >
            {running && job?.kind === 'scan' && <Spinner className="w-4 h-4" />}
            {t('lyrics.scan')}
          </button>
          <button
            onClick={() => start(() => api.lyrics.scan(true))}
            disabled={running}
            title={t('lyrics.fullScanTitle')}
            className="text-sm px-4 py-2 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
          >
            {t('lyrics.fullScan')}
          </button>
          <button
            onClick={() => start(() => api.lyrics.update(retryAll))}
            disabled={running || total === 0 || (!retryAll && (stats?.update_candidates ?? 0) === 0)}
            title={t('lyrics.updateTitle')}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
          >
            {running && job?.kind === 'update' && <Spinner className="w-4 h-4" />}
            {t('lyrics.update')}
          </button>
          {running && (
            <button
              onClick={() => start(() => api.lyrics.cancel())}
              disabled={job?.kind === null}
              className="text-sm px-3 py-2 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover"
            >
              {t('lyrics.cancel')}
            </button>
          )}
        </div>

        {stats && total > 0 && (
          <div className="mt-3 text-xs text-app-text-faint flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t('lyrics.updateCandidates', { count: stats.update_candidates })}</span>
            {stats.not_found_recently > 0 && (
              <>
                <span>{t('lyrics.notFoundRecently', { count: stats.not_found_recently })}</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={retryAll} onChange={(e) => setRetryAll(e.target.checked)} />
                  {t('lyrics.retryAll')}
                </label>
              </>
            )}
          </div>
        )}

        {job?.kind && (running || job.message) && (
          <div className="mt-4">
            {running && (
              <>
                <div className="flex items-center justify-between text-xs text-app-text-muted mb-1">
                  <span>{job.kind === 'scan' ? t('lyrics.job.scan') : t('lyrics.job.update')}</span>
                  <span>{job.total > 0 ? t('lyrics.job.progress', { processed: job.processed, total: job.total }) : ''}</span>
                </div>
                <div className="h-1.5 bg-app-surface-hover rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-app-accent transition-all" style={{ width: `${progress}%` }} />
                </div>
                {job.kind === 'update' && (
                  <div className="text-xs text-app-text-faint">
                    {t('lyrics.job.updateCounts', { updated: job.updated, notFound: job.not_found, errors: job.errors })}
                  </div>
                )}
              </>
            )}
            {job.message && <p className="text-sm text-app-text-muted">{job.message}</p>}
          </div>
        )}
        {actionError && <p className="mt-3 text-sm text-red-300">{actionError}</p>}
      </div>

      {errorGroups.length > 0 && !running && (
        <div className="bg-app-surface border border-red-900/60 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <h2 className="font-medium">{t('lyrics.errors.title', { count: stats?.errors ?? 0 })}</h2>
            <button onClick={() => setFilter('errors')} className="text-xs text-app-accent-text hover:underline">
              {t('lyrics.errors.showTracks')}
            </button>
          </div>
          <p className="text-xs text-app-text-faint mb-3">{t('lyrics.errors.hint')}</p>
          <ul className="flex flex-col gap-3">
            {errorGroups.map((group) => (
              <li key={group.category} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-red-300">{group.category}</span>
                  <span className="text-xs text-app-text-faint whitespace-nowrap">{group.count}</span>
                </div>
                <div className="text-xs text-app-text-faint break-all">{group.example_path}</div>
                {group.example_detail && (
                  <code className="block mt-1 text-xs text-app-text-muted bg-app-bg rounded px-2 py-1 break-all">
                    {group.example_detail}
                  </code>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-app-surface border border-app-border rounded-lg p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <h2 className="font-medium mr-2">{t('lyrics.tracks.title')}</h2>
          {TRACK_FILTERS.map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                filter === value
                  ? 'bg-app-surface-hover border-app-border-strong text-app-text'
                  : 'border-app-border text-app-text-muted hover:text-app-text'
              }`}
            >
              {value === 'all'
                ? t('lyrics.tracks.filterAll')
                : value === 'errors'
                  ? t('lyrics.tracks.filterErrors')
                  : t(STATUS_STYLES[value].key)}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('lyrics.tracks.search')}
            className="ml-auto w-full sm:w-64 bg-app-bg border border-app-border-strong rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
          />
        </div>

        {tracks.length === 0 ? (
          <p className="text-sm text-app-text-muted">{tracksLoading ? t('common.loading') : t('lyrics.tracks.empty')}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {tracks.map((track, idx) => (
                <li
                  key={track.id}
                  className={`flex items-center justify-between text-sm gap-2 px-2 py-1.5 rounded ${
                    idx % 2 === 1 ? 'bg-app-surface-hover/40' : ''
                  }`}
                  title={track.path}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{track.title ?? '-'}</span>
                      {track.artist && <span className="text-app-text-muted"> - {track.artist}</span>}
                    </div>
                    <div className="text-xs text-app-text-faint truncate">
                      {track.album}
                      {track.status !== 'synced' && track.lookup_result && track.lookup_result in LOOKUP_KEYS && (
                        <span
                          className={track.lookup_result === 'error' ? 'text-red-300' : ''}
                          title={track.lookup_error_detail ?? undefined}
                        >
                          {track.album ? ' · ' : ''}
                          {track.lookup_result === 'error' && track.lookup_error
                            ? track.lookup_error
                            : t(LOOKUP_KEYS[track.lookup_result])}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs whitespace-nowrap shrink-0 ${STATUS_STYLES[track.status].text}`}>
                    {t(STATUS_STYLES[track.status].key)}
                    {track.source && <span className="text-app-text-faint"> ({track.source})</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between mt-3 text-xs text-app-text-faint">
              <span>{t('lyrics.tracks.showing', { shown: tracks.length, total: tracksTotal })}</span>
              {tracks.length < tracksTotal && (
                <button
                  onClick={() => loadTracks(tracks.length).catch(() => {})}
                  disabled={tracksLoading}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong text-app-text disabled:opacity-50"
                >
                  {tracksLoading && <Spinner className="w-3 h-3" />}
                  {t('lyrics.tracks.loadMore')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
