import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SimilarArtist } from '../api'
import Spinner from './Spinner'

// Section "Artistes similaires" (Last.fm artist.getSimilar), affichee
// uniquement sur la fiche d'un artiste suivi. Cliquer sur un artiste ouvre la
// meme fiche "apercu" (non suivie) qu'un resultat de recherche ou une
// recommandation Last.fm - voir SearchPage.tsx:view(), meme flux
// previewArtist() + navigation.
export default function SimilarArtistsSection({ artistId }: { artistId: number }) {
  const [artists, setArtists] = useState<SimilarArtist[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    setArtists(null)
    setLoading(true)
    api
      .getSimilarArtists(artistId)
      .then((data) => {
        if (!cancelled) setArtists(data)
      })
      .catch(() => {
        if (!cancelled) setArtists([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [artistId])

  async function open(a: SimilarArtist) {
    setBusyId(a.musicbrainz_id)
    try {
      const artist = await api.previewArtist(a.musicbrainz_id)
      navigate(`/artists/${artist.id}`)
    } catch {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-app-text-muted mb-6">
        <Spinner className="w-4 h-4" />
        Chargement des artistes similaires...
      </div>
    )
  }

  if (!artists || artists.length === 0) return null

  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
      <h2 className="font-medium mb-3">Artistes similaires</h2>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {artists.map((a) => (
          <button
            key={a.musicbrainz_id}
            onClick={() => open(a)}
            disabled={busyId === a.musicbrainz_id}
            className="flex flex-col items-center gap-2 text-center disabled:opacity-50"
            title={`Voir la fiche de ${a.name}`}
          >
            <span className="relative">
              {a.image_url ? (
                <img src={a.image_url} alt="" className="w-16 h-16 rounded-full object-cover bg-app-surface-hover" />
              ) : (
                <span className="flex w-16 h-16 rounded-full bg-app-surface-hover items-center justify-center text-xl">🎤</span>
              )}
              {busyId === a.musicbrainz_id && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <Spinner className="w-5 h-5 text-white" />
                </span>
              )}
            </span>
            <span className="text-sm truncate w-full hover:underline">{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
