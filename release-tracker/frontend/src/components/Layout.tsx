import { type FormEvent, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { DownloadingIcon } from './Spinner'
import PlayerBar from './PlayerBar'
import { usePlayer } from '../context/PlayerContext'
import DownloadGlyph from './DownloadGlyph'
import { ArtistsIcon, BacklogIcon, CalendarIcon, DashboardIcon, LogoutIcon, NavidromeNavIcon, SettingsIcon } from './NavIcons'

const METUBE_POLL_MS = 6000
const BACKLOG_POLL_MS = 20000

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
  }`

const settingsLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
    isActive ? 'bg-neutral-900 text-neutral-300' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
  }`

export default function Layout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [downloading, setDownloading] = useState(false)
  const [backlogCount, setBacklogCount] = useState(0)
  const { queue } = usePlayer()

  // Sonde MeTube depuis le layout (pas seulement depuis la page MeTube elle-meme)
  // pour pouvoir signaler un telechargement en cours meme quand l'utilisateur est
  // sur une autre page - ignore silencieusement les erreurs (MeTube pas configure).
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const history = await api.metubeHistory()
        if (!cancelled) setDownloading(history.queue.length > 0)
      } catch {
        if (!cancelled) setDownloading(false)
      }
    }
    poll()
    const interval = window.setInterval(poll, METUBE_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  // Meme logique que le sondage MeTube ci-dessus : signale un backlog a traiter
  // depuis n'importe quelle page, pas seulement depuis /backlog.
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const backlog = await api.tagging.backlog()
        if (!cancelled) setBacklogCount(backlog.length)
      } catch {
        if (!cancelled) setBacklogCount(0)
      }
    }
    poll()
    const interval = window.setInterval(poll, BACKLOG_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  async function logout() {
    await api.authLogout()
    window.dispatchEvent(new Event('auth:unauthorized'))
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-neutral-800 flex flex-col">
        <Link to="/" className="flex items-center gap-2 font-semibold text-lg px-4 py-3 hover:bg-neutral-900 transition-colors">
          <img src="/favicon.svg" alt="" className="w-6 h-6" />
          MusicReleasarr
        </Link>
        <nav className="flex flex-col gap-1 px-2 py-2 flex-1 overflow-y-auto">
          <NavLink to="/" end className={navLinkClass}>
            <DashboardIcon className="w-4 h-4 shrink-0" />
            Tableau de bord
          </NavLink>
          <NavLink to="/artists" className={navLinkClass}>
            <ArtistsIcon className="w-4 h-4 shrink-0" />
            Artistes
          </NavLink>
          <NavLink to="/calendar" className={navLinkClass}>
            <CalendarIcon className="w-4 h-4 shrink-0" />
            Calendrier
          </NavLink>
          <NavLink to="/metube" className={navLinkClass}>
            <DownloadGlyph className="w-4 h-4 shrink-0" />
            <span className="inline-flex items-center gap-1.5">
              MeTube
              {downloading && <DownloadingIcon />}
            </span>
          </NavLink>
          <NavLink to="/backlog" className={navLinkClass}>
            <BacklogIcon className="w-4 h-4 shrink-0" />
            <span className="inline-flex items-center gap-1.5">
              Backlog
              {backlogCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-600 text-white text-[10px] font-semibold">
                  {backlogCount}
                </span>
              )}
            </span>
          </NavLink>
          <NavLink to="/navidrome" className={navLinkClass}>
            <NavidromeNavIcon className="w-4 h-4 shrink-0" />
            Navidrome
          </NavLink>
        </nav>
        <div className="px-2 py-2 border-t border-neutral-800">
          <NavLink to="/settings" className={settingsLinkClass}>
            <SettingsIcon className="w-4 h-4 shrink-0" />
            Reglages
          </NavLink>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-neutral-800 sticky top-0 bg-neutral-950/90 backdrop-blur z-10">
          <div className="flex items-center gap-4 px-4 py-3">
            <form onSubmit={onSubmit} className="flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un artiste..."
                className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </form>
            <button
              onClick={logout}
              title="Se deconnecter"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 whitespace-nowrap shrink-0"
            >
              <LogoutIcon className="w-4 h-4" />
              Deconnexion
            </button>
          </div>
        </header>
        <main className={`flex-1 w-full px-6 py-6 ${queue.length > 0 ? 'pb-24' : ''}`}>
          <Outlet />
        </main>
        <PlayerBar />
      </div>
    </div>
  )
}
