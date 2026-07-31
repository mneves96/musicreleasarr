import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ALL_RELEASE_TYPES, api, type ArtistSearchResult } from '../api'

export default function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const [results, setResults] = useState<ArtistSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!query) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    api
      .searchArtists(query)
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de recherche'))
      .finally(() => setLoading(false))
  }, [query])

  async function follow(result: ArtistSearchResult) {
    setBusyId(result.musicbrainz_id)
    try {
      const artist = await api.followArtist({
        musicbrainz_id: result.musicbrainz_id,
        notify_enabled: true,
        auto_download: false,
        followed_release_types: ALL_RELEASE_TYPES,
      })
      navigate(`/artists/${artist.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du suivi')
      setBusyId(null)
    }
  }

  async function view(result: ArtistSearchResult) {
    setBusyId(result.musicbrainz_id)
    try {
      const artist = await api.previewArtist(result.musicbrainz_id)
      navigate(`/artists/${artist.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur a l'ouverture de la fiche")
      setBusyId(null)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">
        {query ? `Resultats pour "${query}"` : 'Recherche d\'artistes'}
      </h1>
      {!query && <p className="text-neutral-400">Utilise la barre de recherche en haut de page.</p>}
      {loading && <p className="text-neutral-400">Recherche en cours...</p>}
      {error && <p className="text-red-400">{error}</p>}
      <div className="flex flex-col gap-2">
        {results.map((r) => (
          <div
            key={r.musicbrainz_id}
            className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800"
          >
            <button
              onClick={() => view(r)}
              disabled={busyId === r.musicbrainz_id}
              className="flex items-center gap-3 min-w-0 flex-1 text-left disabled:opacity-50"
              title="Voir la fiche de l'artiste"
            >
              {r.image_url ? (
                <img src={r.image_url} alt="" className="w-10 h-10 rounded-full object-cover bg-neutral-800 shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-base shrink-0">🎤</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate hover:underline">{r.name}</div>
                {r.disambiguation && <div className="text-xs text-neutral-400 truncate">{r.disambiguation}</div>}
              </div>
            </button>
            {r.already_followed ? (
              <span className="text-xs text-neutral-500 whitespace-nowrap">Deja suivi</span>
            ) : (
              <button
                onClick={() => follow(r)}
                disabled={busyId === r.musicbrainz_id}
                className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
              >
                {busyId === r.musicbrainz_id ? '...' : 'Suivre'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
