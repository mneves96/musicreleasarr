import { type FormEvent, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { DownloadingIcon } from './Spinner'
import PlayerBar from './PlayerBar'
import { usePlayer } from '../context/PlayerContext'

const METUBE_POLL_MS = 6000
const BACKLOG_POLL_MS = 20000

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
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
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-800 sticky top-0 bg-neutral-950/90 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-4 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-lg whitespace-nowrap">
            <img src="/favicon.svg" alt="" className="w-6 h-6" />
            MusicReleasarr
          </span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Tableau de bord
            </NavLink>
            <NavLink to="/artists" className={navLinkClass}>
              Artistes
            </NavLink>
            <NavLink to="/calendar" className={navLinkClass}>
              Calendrier
            </NavLink>
            <NavLink to="/metube" className={navLinkClass}>
              <span className="inline-flex items-center gap-1.5">
                MeTube
                {downloading && <DownloadingIcon />}
              </span>
            </NavLink>
            <NavLink to="/backlog" className={navLinkClass}>
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
              Navidrome
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
          <button
            onClick={logout}
            title="Se deconnecter"
            className="text-xs px-3 py-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 whitespace-nowrap"
          >
            Deconnexion
          </button>
        </div>
      </header>
      <main className={`flex-1 max-w-5xl mx-auto w-full px-4 py-6 ${queue.length > 0 ? 'pb-24' : ''}`}>
        <Outlet />
      </main>
      <PlayerBar />
    </div>
  )
}
