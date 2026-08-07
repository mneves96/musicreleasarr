import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, RELEASE_TYPE_LABELS, type Release } from '../api'
import { DownloadBadge, OwnershipBadge } from '../components/StatusBadge'
import Spinner, { LoadingBlock } from '../components/Spinner'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function buildGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7 // 0 = lundi
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - firstWeekday)

  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

// "YYYY-MM-DD" -> cle "YYYY-MM" + libelle "Aout 2026", en decoupant directement
// la chaine plutot que via `new Date(...)` pour eviter tout decalage de fuseau
// horaire sur une date sans heure.
function monthKeyAndLabel(isoDate: string): { key: string; label: string } {
  const year = isoDate.slice(0, 4)
  const monthIndex = Number(isoDate.slice(5, 7)) - 1
  return { key: isoDate.slice(0, 7), label: `${MONTH_NAMES[monthIndex]} ${year}` }
}

type Tab = 'month' | 'events'

const TAB_STORAGE_KEY = 'calendar.tab'
const EVENTS_SORT_STORAGE_KEY = 'calendar.eventsSortDesc'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = localStorage.getItem(key)
  return (allowed as readonly string[]).includes(stored ?? '') ? (stored as T) : fallback
}

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>(() => readStored(TAB_STORAGE_KEY, ['month', 'events'] as const, 'month'))
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [monthReleases, setMonthReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)

  const grid = useMemo(() => buildGrid(month), [month])
  const today = toISODate(new Date())

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  }, [tab])

  useEffect(() => {
    if (tab !== 'month') return
    setLoading(true)
    const from = toISODate(grid[0])
    const to = toISODate(grid[grid.length - 1])
    api
      .listReleases({ from, to, limit: 500 })
      .then((page) => setMonthReleases(page.results))
      .finally(() => setLoading(false))
  }, [grid, tab])

  const releasesByDate = useMemo(() => {
    const map = new Map<string, Release[]>()
    for (const r of monthReleases) {
      if (!r.release_date) continue
      const list = map.get(r.release_date) ?? []
      list.push(r)
      map.set(r.release_date, list)
    }
    return map
  }, [monthReleases])

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Calendrier</h1>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('month')}
            className={`text-xs px-3 py-1.5 rounded-md ${tab === 'month' ? 'bg-app-border-strong' : 'bg-app-surface text-app-text-muted'}`}
          >
            Mois
          </button>
          <button
            onClick={() => setTab('events')}
            className={`text-xs px-3 py-1.5 rounded-md ${tab === 'events' ? 'bg-app-border-strong' : 'bg-app-surface text-app-text-muted'}`}
          >
            Evenements
          </button>
        </div>
      </div>

      {tab === 'month' ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium">
              {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                className="px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong text-sm"
              >
                ← Precedent
              </button>
              <button
                onClick={() => setMonth(startOfMonth(new Date()))}
                className="px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong text-sm"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                className="px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong text-sm"
              >
                Suivant →
              </button>
            </div>
          </div>

          {loading && <div className="mb-2"><LoadingBlock /></div>}

          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-7 gap-1 text-xs text-app-text-faint mb-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((day) => {
                  const iso = toISODate(day)
                  const inMonth = day.getMonth() === month.getMonth()
                  const dayReleases = releasesByDate.get(iso) ?? []
                  return (
                    <div
                      key={iso}
                      className={`min-h-24 sm:min-h-32 rounded-md border p-1 flex flex-col gap-1 ${
                        inMonth ? 'border-app-border bg-app-surface' : 'border-app-border bg-app-bg opacity-40'
                      } ${iso === today ? 'ring-1 ring-app-accent' : ''}`}
                    >
                      <div className="text-xs text-app-text-faint">{day.getDate()}</div>
                      {dayReleases.slice(0, 2).map((r) => (
                        <Link
                          key={r.id}
                          to={`/artists/${r.artist_id}`}
                          className="flex items-center gap-1 bg-app-surface-hover hover:bg-app-border-strong rounded px-1 py-0.5"
                          title={`${r.artist_name} - ${r.title} (${RELEASE_TYPE_LABELS[r.release_type]})`}
                        >
                          {r.cover_url ? (
                            <img src={r.cover_url} alt="" className="w-5 h-5 rounded object-cover bg-app-border-strong shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded bg-app-border-strong shrink-0" />
                          )}
                          <div className="min-w-0 leading-tight">
                            <div className="text-[11px] font-medium truncate">{r.artist_name}</div>
                            <div className="text-[10px] text-app-text-muted truncate">
                              {r.title} · {RELEASE_TYPE_LABELS[r.release_type]}
                            </div>
                          </div>
                        </Link>
                      ))}
                      {dayReleases.length > 2 && (
                        <span className="text-[11px] text-app-text-faint">+{dayReleases.length - 2} autres</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <EventsView />
      )}
    </div>
  )
}

const EVENTS_PAGE_SIZE = 40
const EVENTS_SEARCH_DEBOUNCE_MS = 300

function EventsView() {
  const navigate = useNavigate()
  const [releases, setReleases] = useState<Release[]>([])
  const [total, setTotal] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sortDesc, setSortDesc] = useState(() => localStorage.getItem(EVENTS_SORT_STORAGE_KEY) !== 'false')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    localStorage.setItem(EVENTS_SORT_STORAGE_KEY, String(sortDesc))
  }, [sortDesc])

  // Debounce de la recherche : evite une requete par frappe.
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(queryInput.trim()), EVENTS_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [queryInput])

  // Recharge depuis le debut des que le tri ou la recherche change - la
  // pagination accumulee jusque-la n'est plus valide.
  useEffect(() => {
    const seq = ++requestSeq.current
    setInitialLoading(true)
    api
      .listReleases({ offset: 0, limit: EVENTS_PAGE_SIZE, q: query, order: sortDesc ? 'desc' : 'asc' })
      .then((page) => {
        if (seq !== requestSeq.current) return
        setReleases(page.results)
        setTotal(page.total)
      })
      .finally(() => {
        if (seq === requestSeq.current) setInitialLoading(false)
      })
  }, [query, sortDesc])

  const loadMore = useCallback(() => {
    if (loadingMore || initialLoading || releases.length >= total) return
    const seq = requestSeq.current
    setLoadingMore(true)
    api
      .listReleases({ offset: releases.length, limit: EVENTS_PAGE_SIZE, q: query, order: sortDesc ? 'desc' : 'asc' })
      .then((page) => {
        if (seq !== requestSeq.current) return
        setReleases((prev) => [...prev, ...page.results])
        setTotal(page.total)
      })
      .finally(() => setLoadingMore(false))
  }, [initialLoading, loadingMore, sortDesc, query, releases.length, total])

  // Scroll infini : declenche loadMore() quand la sentinelle en bas de liste devient visible.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  const groups = useMemo(() => {
    const result: { key: string; label: string; items: Release[] }[] = []
    for (const release of releases) {
      if (!release.release_date) continue
      const { key, label } = monthKeyAndLabel(release.release_date)
      const lastGroup = result[result.length - 1]
      if (lastGroup && lastGroup.key === key) {
        lastGroup.items.push(release)
      } else {
        result.push({ key, label, items: [release] })
      }
    }
    return result
  }, [releases])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Filtrer par titre ou artiste..."
          className="bg-app-surface border border-app-border-strong rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
        />
        <button
          onClick={() => setSortDesc((v) => !v)}
          title={sortDesc ? 'Plus recentes en premier' : 'Plus anciennes en premier'}
          className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover border border-app-border-strong hover:bg-app-border-strong whitespace-nowrap"
        >
          Date {sortDesc ? '↓' : '↑'}
        </button>
      </div>

      {initialLoading && <LoadingBlock />}
      {!initialLoading && groups.length === 0 && (
        <p className="text-app-text-muted text-sm">Aucune sortie ne correspond au filtre.</p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="mb-6">
          <h2 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-2 sticky top-[3.25rem] bg-app-bg/90 backdrop-blur py-1">
            {group.label}
          </h2>
          <div className="flex flex-col gap-2">
            {group.items.map((r) => (
              <CalendarEventRow key={r.id} release={r} onNavigate={() => navigate(`/artists/${r.artist_id}`)} />
            ))}
          </div>
        </div>
      ))}

      {!initialLoading && groups.length > 0 && <div ref={sentinelRef} className="h-1" />}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <Spinner className="w-5 h-5" />
        </div>
      )}
    </div>
  )
}

function CalendarEventRow({ release, onNavigate }: { release: Release; onNavigate: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function download(e: MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.downloadRelease(release.id)
      setMessage(result.message)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const downloadLabel = release.ownership_status === 'owned' ? 'Retelecharger' : 'Telecharger'

  return (
    <div
      onClick={onNavigate}
      className="flex items-center gap-3 p-3 rounded-lg bg-app-surface border border-app-border hover:border-app-border-strong cursor-pointer"
    >
      {release.cover_url ? (
        <img src={release.cover_url} alt="" className="w-12 h-12 rounded object-cover bg-app-surface-hover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded bg-app-surface-hover flex items-center justify-center text-lg shrink-0">🎧</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{release.title}</div>
        <div className="text-sm text-app-text-muted truncate">
          {release.artist_name} - {RELEASE_TYPE_LABELS[release.release_type]} - {release.release_date}
        </div>
        {message && <div className="text-xs text-app-text-muted mt-1">{message}</div>}
      </div>
      <OwnershipBadge status={release.ownership_status} />
      <DownloadBadge status={release.download_status} error={release.download_error} />
      {release.download_status !== 'queued' && (
        <button
          onClick={download}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? '...' : downloadLabel}
        </button>
      )}
    </div>
  )
}
