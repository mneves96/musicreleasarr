import { type FormEvent, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import PlayerBar from './PlayerBar'
import { usePlayer } from '../context/PlayerContext'
import { useSwipe } from '../hooks/useSwipe'
import AppLogo from './AppLogo'
import DownloadGlyph from './DownloadGlyph'
import {
  ArtistsIcon,
  BacklogIcon,
  CalendarIcon,
  CloseIcon,
  DashboardIcon,
  LogoutIcon,
  MenuIcon,
  NavidromeNavIcon,
  SettingsIcon,
} from './NavIcons'

const METUBE_POLL_MS = 6000
const BACKLOG_POLL_MS = 20000

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-app-surface-hover text-app-text' : 'text-app-text-muted hover:text-app-text hover:bg-app-surface-hover'
  }`

const settingsLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
    isActive ? 'bg-app-surface text-app-text-muted' : 'text-app-text-faint hover:text-app-text-muted hover:bg-app-surface'
  }`

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [downloading, setDownloading] = useState(false)
  const [backlogCount, setBacklogCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
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

  // Referme le tiroir de navigation mobile a chaque changement de page -
  // sans ca, l'utilisateur se retrouve sur la nouvelle page avec le tiroir
  // encore ouvert par-dessus.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Balayer depuis le bord gauche de l'ecran vers la droite ouvre le tiroir
  // de navigation, comme le geste standard des apps mobiles - ecoute au
  // niveau du document (pas d'un element precis) puisque le point de depart
  // peut tomber sur n'importe quel contenu de page, avec une contrainte sur
  // la position de depart (EDGE_THRESHOLD_PX) pour ne pas se declencher sur
  // un balayage horizontal ailleurs sur la page (ex: a l'interieur d'une
  // liste). Inactif tant que le tiroir est deja ouvert.
  useEffect(() => {
    if (sidebarOpen) return
    const EDGE_THRESHOLD_PX = 24
    const OPEN_DISTANCE_PX = 60
    let start: { x: number; y: number } | null = null

    function onTouchStart(e: globalThis.TouchEvent) {
      const t = e.touches[0]
      start = t.clientX <= EDGE_THRESHOLD_PX ? { x: t.clientX, y: t.clientY } : null
    }
    function onTouchEnd(e: globalThis.TouchEvent) {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      start = null
      if (dx >= OPEN_DISTANCE_PX && Math.abs(dy) < dx) setSidebarOpen(true)
    }
    function onTouchCancel() {
      start = null
    }

    document.addEventListener('touchstart', onTouchStart)
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchCancel)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [sidebarOpen])

  // Balayer vers la gauche sur le tiroir ouvert le referme, en complement du
  // clic sur le fond assombri et du bouton fermer.
  const closeSwipe = useSwipe({ onSwipeLeft: () => setSidebarOpen(false) })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  async function logout() {
    await api.authLogout()
    window.dispatchEvent(new Event('auth:unauthorized'))
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <aside
        {...closeSwipe}
        className={`w-56 shrink-0 border-r border-app-border bg-app-bg flex flex-col h-full fixed inset-y-0 left-0 z-30 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold text-lg px-2 py-1 rounded-md hover:bg-app-surface-hover transition-colors"
          >
            <AppLogo className="w-6 h-6 text-app-accent shrink-0" />
            MusicReleasarr
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover shrink-0"
            title="Fermer le menu"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
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
            <DownloadGlyph className={`w-4 h-4 shrink-0 ${downloading ? 'animate-bounce' : ''}`} />
            MeTube
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
        <div className="px-2 py-2 border-t border-app-border">
          <NavLink to="/settings" className={settingsLinkClass}>
            <SettingsIcon className="w-4 h-4 shrink-0" />
            Reglages
          </NavLink>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
        <header className="border-b border-app-border sticky top-0 bg-app-bg/90 backdrop-blur z-10">
          <div className="flex items-center gap-2 sm:gap-4 px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover shrink-0"
              title="Ouvrir le menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <form onSubmit={onSubmit} className="flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un artiste..."
                className="w-full bg-app-surface border border-app-border-strong rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
            </form>
            <button
              onClick={logout}
              title="Se deconnecter"
              className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-2 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover whitespace-nowrap shrink-0"
            >
              <LogoutIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Deconnexion</span>
            </button>
          </div>
        </header>
        <main className={`flex-1 w-full px-4 sm:px-6 py-6 ${queue.length > 0 ? 'pb-24' : ''}`}>
          <Outlet />
        </main>
        <PlayerBar />
      </div>
    </div>
  )
}
