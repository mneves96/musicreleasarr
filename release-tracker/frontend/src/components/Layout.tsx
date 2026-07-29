import { type FormEvent, useState } from 'react'
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
  }`

export default function Layout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-800 sticky top-0 bg-neutral-950/90 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-4 px-4 py-3">
          <span className="font-semibold text-lg whitespace-nowrap">🎵 MusicReleasarr</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Suivis
            </NavLink>
            <NavLink to="/calendar" className={navLinkClass}>
              Calendrier
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Reglages
            </NavLink>
          </nav>
          <form onSubmit={onSubmit} className="flex-1 max-w-sm ml-auto">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un artiste..."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </form>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
