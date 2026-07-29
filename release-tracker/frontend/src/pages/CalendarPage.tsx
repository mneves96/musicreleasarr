import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Release } from '../api'

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

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)

  const grid = useMemo(() => buildGrid(month), [month])
  const today = toISODate(new Date())

  useEffect(() => {
    setLoading(true)
    const from = toISODate(grid[0])
    const to = toISODate(grid[grid.length - 1])
    api
      .listReleases(from, to)
      .then(setReleases)
      .finally(() => setLoading(false))
  }, [grid])

  const releasesByDate = useMemo(() => {
    const map = new Map<string, Release[]>()
    for (const r of releases) {
      if (!r.release_date) continue
      const list = map.get(r.release_date) ?? []
      list.push(r)
      map.set(r.release_date, list)
    }
    return map
  }, [releases])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </h1>
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

      {loading && <p className="text-neutral-400 mb-2">Chargement...</p>}

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
              className={`min-h-24 rounded-md border p-1 flex flex-col gap-1 ${
                inMonth ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-900 bg-neutral-950 opacity-40'
              } ${iso === today ? 'ring-1 ring-purple-500' : ''}`}
            >
              <div className="text-xs text-neutral-500">{day.getDate()}</div>
              {dayReleases.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  to={`/artists/${r.artist_id}`}
                  className="text-[11px] leading-tight bg-neutral-800 hover:bg-neutral-700 rounded px-1 py-0.5 truncate"
                  title={`${r.artist_name} - ${r.title}`}
                >
                  {r.artist_name}
                </Link>
              ))}
              {dayReleases.length > 3 && (
                <span className="text-[11px] text-neutral-500">+{dayReleases.length - 3} autres</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
