import { usePlayer } from '../context/PlayerContext'

function PlayPauseIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <path d="M7 5v14l12-7z" />
    </svg>
  )
}

function PreviousIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
    </svg>
  )
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M4 9v6h4l5 5V4L8 9H4z" />
      <path d="M16.5 12a3.5 3.5 0 0 0-1.77-3.04l.02 6.08a3.5 3.5 0 0 0 1.75-3.04z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PlayerBar() {
  const {
    queue,
    currentIndex,
    isPlaying,
    volume,
    currentTime,
    duration,
    togglePlayPause,
    next,
    previous,
    setVolume,
    seekTo,
    close,
  } = usePlayer()

  if (queue.length === 0) return null

  const track = queue[currentIndex]

  return (
    <div className="fixed bottom-0 left-56 right-0 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 z-20">
      <div className="flex items-center gap-2 px-6 pt-1.5 text-[10px] text-neutral-500 tabular-nums">
        <span className="w-9 text-right shrink-0">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="flex-1 seek-slider"
          title="Avancer/reculer dans la piste"
        />
        <span className="w-9 shrink-0">{formatTime(duration)}</span>
      </div>
      <div className="flex items-center gap-4 px-6 pb-2.5 pt-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{track.title}</div>
          <div className="text-xs text-neutral-400 truncate">
            {track.artist_name} - {track.album_title}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={previous}
            disabled={currentIndex === 0}
            className="p-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Piste precedente"
          >
            <PreviousIcon />
          </button>
          <button
            onClick={togglePlayPause}
            className="p-2 rounded-full bg-purple-700 hover:bg-purple-600 text-white"
            title={isPlaying ? 'Pause' : 'Lecture'}
          >
            <PlayPauseIcon playing={isPlaying} />
          </button>
          <button
            onClick={next}
            disabled={currentIndex >= queue.length - 1}
            className="p-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Piste suivante"
          >
            <NextIcon />
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0 w-28">
          <VolumeIcon />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-purple-600"
            title="Volume"
          />
        </div>

        <button
          onClick={close}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 shrink-0"
          title="Fermer le lecteur"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
