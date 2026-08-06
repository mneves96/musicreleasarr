import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ALL_RELEASE_TYPES, api, type ArtistSearchResult } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'

interface RowState {
  artistId: number | null
  isFollowed: boolean
  notifyEnabled: boolean
  autoDownload: boolean
  busy: boolean
}

function initialRowState(): RowState {
  return { artistId: null, isFollowed: false, notifyEnabled: false, autoDownload: false, busy: false }
}

function RecommendedArtistRow({ result }: { result: ArtistSearchResult }) {
  const [state, setState] = useState<RowState>(initialRowState)

  async function toggleFollow(checked: boolean) {
    setState((s) => ({ ...s, busy: true }))
    try {
      if (checked) {
        const artist = await api.followArtist({
          musicbrainz_id: result.musicbrainz_id,
          notify_enabled: state.notifyEnabled,
          auto_download: state.autoDownload,
          followed_release_types: ALL_RELEASE_TYPES,
        })
        setState((s) => ({ ...s, artistId: artist.id, isFollowed: true }))
      } else if (state.artistId) {
        await api.updateArtist(state.artistId, { is_followed: false })
        setState((s) => ({ ...s, isFollowed: false }))
      } else {
        setState((s) => ({ ...s, isFollowed: false }))
      }
    } finally {
      setState((s) => ({ ...s, busy: false }))
    }
  }

  // Modifiables avant meme de suivre (pris en compte au moment ou "Suivre cet
  // artiste" est coche) et, une fois suivi, appliques immediatement comme sur
  // la fiche artiste (parametres de suivi).
  async function toggleNotify(checked: boolean) {
    setState((s) => ({ ...s, notifyEnabled: checked }))
    if (state.artistId) await api.updateArtist(state.artistId, { notify_enabled: checked })
  }

  async function toggleAutoDownload(checked: boolean) {
    setState((s) => ({ ...s, autoDownload: checked }))
    if (state.artistId) await api.updateArtist(state.artistId, { auto_download: checked })
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800">
      {result.image_url ? (
        <img src={result.image_url} alt="" className="w-10 h-10 rounded-full object-cover bg-neutral-800 shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-base shrink-0">🎤</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{result.name}</div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-neutral-300 shrink-0">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={state.isFollowed}
            disabled={state.busy}
            onChange={(e) => toggleFollow(e.target.checked)}
          />
          Suivre cet artiste
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={state.notifyEnabled}
            disabled={state.busy}
            onChange={(e) => toggleNotify(e.target.checked)}
          />
          Me notifier des nouvelles sorties
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={state.autoDownload}
            disabled={state.busy}
            onChange={(e) => toggleAutoDownload(e.target.checked)}
          />
          Telecharger automatiquement les sorties manquantes
        </label>
      </div>
      {state.busy && <Spinner className="w-4 h-4 shrink-0" />}
    </div>
  )
}

// Certaines recommandations Last.fm sans MusicBrainz id declenchent une
// resolution par nom cote backend (limitee a 1 req/s MusicBrainz) - la
// reponse peut donc legitimement prendre plusieurs secondes, sans que ce soit
// bloque pour autant. Au-dela de ce delai, on le signale plutot que de
// laisser un loader tourner sans explication.
const SLOW_HINT_MS = 8000

export default function RecommendedArtistsPage() {
  const [results, setResults] = useState<ArtistSearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    let cancelled = false
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlow(true)
    }, SLOW_HINT_MS)

    api
      .getRecommendedArtists()
      .then((data) => {
        if (cancelled) return
        setResults(data)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Erreur')
      })
      .finally(() => window.clearTimeout(slowTimer))

    return () => {
      cancelled = true
      window.clearTimeout(slowTimer)
    }
  }, [])

  if (error) {
    return (
      <div className="text-neutral-400">
        <p>{error}</p>
        <p className="mt-2">
          Renseigne une cle API + secret Last.fm et connecte ton compte dans{' '}
          <Link to="/settings" className="text-purple-400 hover:underline">
            Reglages
          </Link>{' '}
          pour voir des recommandations personnalisees.
        </p>
      </div>
    )
  }

  if (results === null) {
    return (
      <div>
        <LoadingBlock />
        {slow && (
          <p className="text-xs text-neutral-500 mt-2">
            Ca prend plus longtemps que prevu (resolution de certains artistes cote MusicBrainz, limitee a 1
            requete/seconde) - encore quelques secondes...
          </p>
        )}
      </div>
    )
  }

  const toShow = results.filter((r) => !r.already_followed)

  return (
    <div>
      {toShow.length === 0 ? (
        <p className="text-neutral-400 text-sm">
          {results.length === 0
            ? 'Aucune recommandation disponible pour le moment.'
            : 'Tu suis deja tous les artistes recommandes en ce moment.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {toShow.map((r) => (
            <RecommendedArtistRow key={r.musicbrainz_id} result={r} />
          ))}
        </div>
      )}
    </div>
  )
}
