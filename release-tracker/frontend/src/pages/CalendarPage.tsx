import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, RELEASE_TYPE_LABELS, type Release } from '../api'
import { DownloadBadge, OwnershipBadge } from '../components/StatusBadge'
import { LoadingBlock } from '../components/Spinner'

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

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>('month')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [monthReleases, setMonthReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)

  const grid = useMemo(() => buildGrid(month), [month])
  const today = toISODate(new Date())

  useEffect(() => {
    if (tab !== 'month') return
    setLoading(true)
    const from = toISODate(grid[0])
    const to = toISODate(grid[grid.length - 1])
    api
      .listReleases(from, to)
      .then(setMonthReleases)
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
            className={`text-xs px-3 py-1.5 rounded-md ${tab === 'month' ? 'bg-neutral-700' : 'bg-neutral-900 text-neutral-400'}`}
          >
            Mois
          </button>
          <button
            onClick={() => setTab('events')}
            className={`text-xs px-3 py-1.5 rounded-md ${tab === 'events' ? 'bg-neutral-700' : 'bg-neutral-900 text-neutral-400'}`}
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
                className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm"
              >
                ← Precedent
              </button>
              <button
                onClick={() => setMonth(startOfMonth(new Date()))}
                className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm"
              >
                Suivant →
              </button>
            </div>
          </div>

          {loading && <div className="mb-2"><LoadingBlock /></div>}

          <div className="grid grid-cols-7 gap-1 text-xs text-neutral-500 mb-1">
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
                  className={`min-h-32 rounded-md border p-1 flex flex-col gap-1 ${
                    inMonth ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-900 bg-neutral-950 opacity-40'
                  } ${iso === today ? 'ring-1 ring-purple-500' : ''}`}
                >
                  <div className="text-xs text-neutral-500">{day.getDate()}</div>
                  {dayReleases.slice(0, 2).map((r) => (
                    <Link
                      key={r.id}
                      to={`/artists/${r.artist_id}`}
                      className="flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 rounded px-1 py-0.5"
                      title={`${r.artist_name} - ${r.title} (${RELEASE_TYPE_LABELS[r.release_type]})`}
                    >
                      {r.cover_url ? (
                        <img src={r.cover_url} alt="" className="w-5 h-5 rounded object-cover bg-neutral-700 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded bg-neutral-700 shrink-0" />
                      )}
                      <div className="min-w-0 leading-tight">
                        <div className="text-[11px] font-medium truncate">{r.artist_name}</div>
                        <div className="text-[10px] text-neutral-400 truncate">
                          {r.title} · {RELEASE_TYPE_LABELS[r.release_type]}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {dayReleases.length > 2 && (
                    <span className="text-[11px] text-neutral-500">+{dayReleases.length - 2} autres</span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <EventsView />
      )}
    </div>
  )
}

function EventsView() {
  const navigate = useNavigate()
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [sortDesc, setSortDesc] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    api
      .listReleases()
      .then(setReleases)
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    let filtered = releases.filter((r) => r.release_date)
    if (q) {
      filtered = filtered.filter(
        (r) => r.title.toLowerCase().includes(q) || r.artist_name.toLowerCase().includes(q)
      )
    }
    filtered = [...filtered].sort((a, b) => {
      const cmp = a.release_date!.localeCompare(b.release_date!)
      return sortDesc ? -cmp : cmp
    })

    const result: { key: string; label: string; items: Release[] }[] = []
    for (const release of filtered) {
      const { key, label } = monthKeyAndLabel(release.release_date!)
      const lastGroup = result[result.length - 1]
      if (lastGroup && lastGroup.key === key) {
        lastGroup.items.push(release)
      } else {
        result.push({ key, label, items: [release] })
      }
    }
    return result
  }, [releases, query, sortDesc])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par titre ou artiste..."
          className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={() => setSortDesc((v) => !v)}
          title={sortDesc ? 'Plus recentes en premier' : 'Plus anciennes en premier'}
          className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 whitespace-nowrap"
        >
          Date {sortDesc ? '↓' : '↑'}
        </button>
      </div>

      {loading && <LoadingBlock />}
      {!loading && groups.length === 0 && (
        <p className="text-neutral-400 text-sm">Aucune sortie ne correspond au filtre.</p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="mb-6">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2 sticky top-[3.25rem] bg-neutral-950/90 backdrop-blur py-1">
            {group.label}
          </h2>
          <div className="flex flex-col gap-2">
            {group.items.map((r) => (
              <CalendarEventRow key={r.id} release={r} onNavigate={() => navigate(`/artists/${r.artist_id}`)} />
            ))}
          </div>
        </div>
      ))}
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
      className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 cursor-pointer"
    >
      {release.cover_url ? (
        <img src={release.cover_url} alt="" className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded bg-neutral-800 flex items-center justify-center text-lg shrink-0">🎧</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{release.title}</div>
        <div className="text-sm text-neutral-400 truncate">
          {release.artist_name} - {RELEASE_TYPE_LABELS[release.release_type]} - {release.release_date}
        </div>
        {message && <div className="text-xs text-neutral-400 mt-1">{message}</div>}
      </div>
      <OwnershipBadge status={release.ownership_status} />
      <DownloadBadge status={release.download_status} progress={release.download_progress} error={release.download_error} />
      {release.download_status !== 'queued' && (
        <button
          onClick={download}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? '...' : downloadLabel}
        </button>
      )}
    </div>
  )
}
