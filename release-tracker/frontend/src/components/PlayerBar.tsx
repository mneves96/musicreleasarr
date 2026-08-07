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
// notifications lecteur audio Samsung/Material Design 3) : un seul chemin SVG
// (pas une image de fond carrelee, qui laissait des coutures visibles a
// chaque repetition) construit a partir de paires de courbes de Bezier
// cubiques dont les tangentes se raccordent exactement d'une periode a
// l'autre - la courbe reste donc lisse sur toute sa longueur. Anime en
// deplacant tout le tracé d'exactement une periode via transform: translateX,
// ce qui boucle sans a-coup (contrairement a l'animation de background-position
// d'une image carrelee).
const WAVE_PERIOD = 26
const WAVE_AMPLITUDE = 5
const WAVE_CYCLES = 100
const WAVE_WIDTH = WAVE_PERIOD * WAVE_CYCLES
const WAVE_HEIGHT = 16
const WAVE_CENTER = WAVE_HEIGHT / 2

// Le temps courant n'est mis a jour que toutes les 500ms (PlayerContext.tsx
// interroge le lecteur YouTube a cet intervalle, pas plus souvent) : sans
// lissage, le point et le bord de la vague sautaient d'une position a l'autre
// toutes les 500ms au lieu de glisser. Une transition CSS sur la meme duree
// fait glisser en continu entre deux mises a jour - desactivee pendant un
// glisser-deposer actif de l'utilisateur pour rester reactif au clic/glisser
// plutot que de trainer derriere la souris.
const PROGRESS_UPDATE_MS = 500

function buildWavePath(): string {
  const segments: string[] = [`M0,${WAVE_CENTER}`]
  for (let i = 0; i < WAVE_CYCLES; i++) {
    const x0 = i * WAVE_PERIOD
    const qx = x0 + WAVE_PERIOD * 0.25
    const hx = x0 + WAVE_PERIOD * 0.5
    const tx = x0 + WAVE_PERIOD * 0.75
    const ex = x0 + WAVE_PERIOD
    segments.push(`C${qx},${WAVE_CENTER - WAVE_AMPLITUDE} ${qx},${WAVE_CENTER - WAVE_AMPLITUDE} ${hx},${WAVE_CENTER}`)
    segments.push(`C${tx},${WAVE_CENTER + WAVE_AMPLITUDE} ${tx},${WAVE_CENTER + WAVE_AMPLITUDE} ${ex},${WAVE_CENTER}`)
  }
  return segments.join(' ')
}
const WAVE_PATH = buildWavePath()

function ProgressWave({ playing }: { playing: boolean }) {
  return (
    <svg
      width={WAVE_WIDTH}
      height={WAVE_HEIGHT}
      className="progress-wave-svg block"
      style={{ animationPlayState: playing ? 'running' : 'paused' }}
      aria-hidden="true"
    >
      <path d={WAVE_PATH} fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
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
    <div className="fixed bottom-0 left-56 right-0 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 z-20">
      <div className="flex items-center gap-2 px-6 pt-1.5 text-[10px] text-neutral-500 tabular-nums">
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
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-neutral-800 pointer-events-none" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 overflow-hidden pointer-events-none"
            style={{ width: `${progressPercent}%`, height: WAVE_HEIGHT, transition: smoothTransition }}
          >
            <ProgressWave playing={isPlaying} />
          </div>
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full bg-purple-400 pointer-events-none"
            style={{
              left: `${progressPercent}%`,
              marginLeft: '-6px',
              transform: 'translateY(-50%)',
              transition: smoothTransition,
              boxShadow: '0 0 0 2px var(--color-neutral-950)',
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
      <div className="flex items-center gap-4 px-6 pb-2.5 pt-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{track.title}</div>
          <div className="text-xs text-neutral-400 truncate">
            <Link to={`/artists/${track.artist_id}`} className="hover:underline hover:text-neutral-200" title="Voir la fiche artiste">
              {track.artist_name}
            </Link>{' '}
            - {track.album_title}
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
