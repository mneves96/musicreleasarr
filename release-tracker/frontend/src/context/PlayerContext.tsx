import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface QueueTrack {
  video_id: string
  title: string
  artist_id: number
  artist_name: string
  album_title: string
  cover_url: string | null
}

interface YTPlayerInstance {
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  loadVideoById: (videoId: string) => void
  setVolume: (volume: number) => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
}

interface YTPlayerStateEvent {
  data: number
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          playerVars?: Record<string, number | string>
          events?: {
            onReady?: () => void
            onStateChange?: (event: YTPlayerStateEvent) => void
          }
        },
      ) => YTPlayerInstance
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface PlayerContextValue {
  queue: QueueTrack[]
  currentIndex: number
  isPlaying: boolean
  volume: number
  currentTime: number
  duration: number
  playQueue: (tracks: QueueTrack[], startIndex: number) => void
  togglePlayPause: () => void
  next: () => void
  previous: () => void
  setVolume: (v: number) => void
  seekTo: (seconds: number) => void
  close: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer doit etre utilise a l\'interieur de <PlayerProvider>')
  return ctx
}

let apiLoadPromise: Promise<void> | null = null

// L'API IFrame de YouTube (script externe + callback global) ne peut etre chargee
// qu'une seule fois pour toute la page - on reutilise la meme promesse partagee
// si playQueue() est appele plusieurs fois avant que le script ait fini de charger.
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiLoadPromise) return apiLoadPromise
  apiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiLoadPromise
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(80)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayerInstance | null>(null)
  const readyRef = useRef(false)
  // Refs pour echapper aux closures figees de onStateChange, enregistre une seule
  // fois a la creation du player (voir useEffect ci-dessous, deps volontairement vides).
  const queueRef = useRef<QueueTrack[]>([])
  const indexRef = useRef(0)
  queueRef.current = queue
  indexRef.current = currentIndex

  const advance = useCallback((direction: 1 | -1) => {
    const q = queueRef.current
    if (q.length === 0) return
    const nextIndex = indexRef.current + direction
    if (nextIndex < 0 || nextIndex >= q.length) {
      if (direction === 1) {
        playerRef.current?.stopVideo()
        setIsPlaying(false)
      }
      return
    }
    setCurrentIndex(nextIndex)
    setCurrentTime(0)
    setDuration(0)
    playerRef.current?.loadVideoById(q[nextIndex].video_id)
  }, [])

  // Le player YouTube ne pousse pas d'evenement de progression : on interroge
  // getCurrentTime()/getDuration() a intervalle regulier tant qu'une file est active.
  useEffect(() => {
    if (queue.length === 0) return
    const interval = window.setInterval(() => {
      const player = playerRef.current
      if (!player || !readyRef.current) return
      setCurrentTime(player.getCurrentTime())
      setDuration(player.getDuration())
    }, 500)
    return () => window.clearInterval(interval)
  }, [queue.length])

  useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || playerRef.current || !window.YT) return
      playerRef.current = new window.YT.Player(containerRef.current, {
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: () => {
            readyRef.current = true
            playerRef.current?.setVolume(volume)
          },
          onStateChange: (event) => {
            const YT = window.YT
            if (!YT) return
            if (event.data === YT.PlayerState.PLAYING) setIsPlaying(true)
            else if (event.data === YT.PlayerState.PAUSED) setIsPlaying(false)
            else if (event.data === YT.PlayerState.ENDED) advance(1)
          },
        },
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- creation unique du player, volontaire
  }, [])

  const playQueue = useCallback((tracks: QueueTrack[], startIndex: number) => {
    if (tracks.length === 0) return
    setQueue(tracks)
    setCurrentIndex(startIndex)
    setCurrentTime(0)
    setDuration(0)
    const start = () => {
      playerRef.current?.loadVideoById(tracks[startIndex].video_id)
      playerRef.current?.playVideo()
    }
    if (readyRef.current) {
      start()
      return
    }
    // Tout premier lancement de lecture : le player peut encore etre en cours
    // d'initialisation (onReady pas encore recu) meme si le script est deja charge.
    loadYouTubeApi().then(() => {
      const wait = () => {
        if (readyRef.current) start()
        else setTimeout(wait, 100)
      }
      wait()
    })
  }, [])

  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return
    if (isPlaying) playerRef.current.pauseVideo()
    else playerRef.current.playVideo()
  }, [isPlaying])

  const next = useCallback(() => advance(1), [advance])
  const previous = useCallback(() => advance(-1), [advance])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    playerRef.current?.setVolume(v)
  }, [])

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true)
    setCurrentTime(seconds)
  }, [])

  const close = useCallback(() => {
    playerRef.current?.stopVideo()
    setQueue([])
    setCurrentIndex(0)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentIndex,
      isPlaying,
      volume,
      currentTime,
      duration,
      playQueue,
      togglePlayPause,
      next,
      previous,
      setVolume,
      seekTo,
      close,
    }),
    [queue, currentIndex, isPlaying, volume, currentTime, duration, playQueue, togglePlayPause, next, previous, setVolume, seekTo, close],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Player YouTube reel mais invisible : notre UI (PlayerBar) pilote tout via
          le contexte, seul l'audio de l'iframe est rendu (pas display:none, qui
          peut faire jeter/throttle la lecture par certains navigateurs). */}
      <div ref={containerRef} className="fixed -left-[9999px] -top-[9999px] w-px h-px" aria-hidden="true" />
    </PlayerContext.Provider>
  )
}
