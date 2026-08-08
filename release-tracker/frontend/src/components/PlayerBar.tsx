import { useState } from 'react'
import { Link } from 'react-router-dom'
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

// Vague continue (portion deja jouee de la barre de progression, cf. les
// notifications lecteur audio Samsung/Material Design 3) : un vrai sinus
// echantillonne point par point (Math.sin), pas une approximation par
// courbes de Bezier - garantit une sinusoide propre sans risque d'erreur
// d'approximation. Anime en deplacant tout le trace d'exactement une periode
// via transform: translateX, ce qui boucle sans aucune couture puisque la
// fonction est periodique par construction.
const WAVE_PERIOD = 28
const WAVE_AMPLITUDE = 2.5
const WAVE_CYCLES = 60
const WAVE_WIDTH = WAVE_PERIOD * WAVE_CYCLES
const WAVE_HEIGHT = 10
const WAVE_CENTER = WAVE_HEIGHT / 2
const WAVE_SAMPLE_STEP = 1

// Le temps courant n'est mis a jour que toutes les 500ms (PlayerContext.tsx
// interroge le lecteur YouTube a cet intervalle, pas plus souvent) : sans
// lissage, le point et le bord de la vague sautaient d'une position a l'autre
// toutes les 500ms au lieu de glisser. Une transition CSS sur la meme duree
// fait glisser en continu entre deux mises a jour - desactivee pendant un
// glisser-deposer actif de l'utilisateur pour rester reactif au clic/glisser
// plutot que de trainer derriere la souris.
const PROGRESS_UPDATE_MS = 500

function buildWavePath(): string {
  const points: string[] = []
  for (let x = 0; x <= WAVE_WIDTH; x += WAVE_SAMPLE_STEP) {
    const y = WAVE_CENTER + WAVE_AMPLITUDE * Math.sin((x / WAVE_PERIOD) * 2 * Math.PI)
    const command = points.length === 0 ? 'M' : 'L'
    points.push(`${command}${x.toFixed(1)},${y.toFixed(2)}`)
  }
  return points.join(' ')
}
const WAVE_PATH = buildWavePath()

// Aplatit la vague en douceur a la pause (scaleY vers 0, transition CSS sur
// ce wrapper) plutot que de la figer brutalement en forme de sinusoide -
// portee par un element separe du <svg> qui scrolle (translateX via
// @keyframes, voir .progress-wave-svg dans index.css) : les deux transforms
// se composent sans se marcher dessus puisqu'ils vivent chacun sur leur
// propre element plutot que de se disputer la meme propriete CSS transform.
function ProgressWave({ playing }: { playing: boolean }) {
  return (
    <div className="progress-wave-flatten" style={{ transform: playing ? 'scaleY(1)' : 'scaleY(0)' }}>
      <svg
        width={WAVE_WIDTH}
        height={WAVE_HEIGHT}
        className="progress-wave-svg block"
        style={{ animationPlayState: playing ? 'running' : 'paused' }}
        aria-hidden="true"
      >
        <path d={WAVE_PATH} fill="none" stroke="var(--app-accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
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

  const [seeking, setSeeking] = useState(false)

  if (queue.length === 0) return null

  const track = queue[currentIndex]
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const smoothTransition = seeking ? 'none' : `width ${PROGRESS_UPDATE_MS}ms linear, left ${PROGRESS_UPDATE_MS}ms linear`

  return (
    <div className="fixed bottom-0 left-0 lg:left-56 right-0 bg-app-bg/95 backdrop-blur border-t border-app-border z-20">
      <div className="flex items-center gap-2 px-4 sm:px-6 pt-1.5 text-[10px] text-app-text-faint tabular-nums">
        <span className="w-9 text-right shrink-0">{formatTime(currentTime)}</span>
        <div className="relative flex-1 h-4">
          {/* Piste (a jouer) + vague animee (deja joue, comme les notifications
              lecteur audio de Samsung) - purement decoratif, en dessous du vrai
              <input type="range"> qui gere le clic/glisser/clavier avec une
              piste transparente (voir .seek-slider). Le temps courant n'etant
              mis a jour que toutes les PROGRESS_UPDATE_MS, la largeur/position
              transitionnent sur la meme duree pour glisser en continu plutot
              que sauter - desactive pendant un glisser actif pour rester
              reactif au geste de l'utilisateur. */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-app-border pointer-events-none" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 overflow-hidden pointer-events-none"
            style={{ width: `${progressPercent}%`, height: WAVE_HEIGHT, transition: smoothTransition }}
          >
            <ProgressWave playing={isPlaying} />
          </div>
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full bg-app-accent-text pointer-events-none"
            style={{
              left: `${progressPercent}%`,
              marginLeft: '-6px',
              transform: 'translateY(-50%)',
              transition: smoothTransition,
              boxShadow: '0 0 0 2px var(--app-bg)',
            }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seekTo(Number(e.target.value))}
            onPointerDown={() => setSeeking(true)}
            onPointerUp={() => setSeeking(false)}
            className="seek-slider seek-slider-hidden-thumb relative z-10 w-full"
            title="Avancer/reculer dans la piste"
          />
        </div>
        <span className="w-9 shrink-0">{formatTime(duration)}</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 pb-2.5 pt-1">
        {track.cover_url ? (
          <img src={track.cover_url} alt="" className="w-10 h-10 rounded object-cover bg-app-surface-hover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded bg-app-surface-hover flex items-center justify-center text-base shrink-0">🎧</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{track.title}</div>
          <div className="text-xs text-app-text-muted truncate">
            <Link to={`/artists/${track.artist_id}`} className="hover:underline hover:text-app-text" title="Voir la fiche artiste">
              {track.artist_name}
            </Link>{' '}
            - {track.album_title}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={previous}
            disabled={currentIndex === 0}
            className="hidden sm:inline-flex p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover disabled:opacity-30 disabled:hover:bg-transparent"
            title="Piste precedente"
          >
            <PreviousIcon />
          </button>
          <button
            onClick={togglePlayPause}
            className="p-2 rounded-full bg-app-accent hover:bg-app-accent-hover text-white"
            title={isPlaying ? 'Pause' : 'Lecture'}
          >
            <PlayPauseIcon playing={isPlaying} />
          </button>
          <button
            onClick={next}
            disabled={currentIndex >= queue.length - 1}
            className="hidden sm:inline-flex p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover disabled:opacity-30 disabled:hover:bg-transparent"
            title="Piste suivante"
          >
            <NextIcon />
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1.5 shrink-0 w-28">
          <VolumeIcon />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-(--app-accent)"
            title="Volume"
          />
        </div>

        <button
          onClick={close}
          className="p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-surface-hover shrink-0"
          title="Fermer le lecteur"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
