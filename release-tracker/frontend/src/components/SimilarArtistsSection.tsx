import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SimilarArtist } from '../api'
import Spinner from './Spinner'

// Section "Artistes similaires" (Last.fm artist.getSimilar), affichee
// uniquement sur la fiche d'un artiste suivi. Cliquer sur un artiste ouvre la
// meme fiche "apercu" (non suivie) qu'un resultat de recherche ou une
// recommandation Last.fm - voir SearchPage.tsx:view(), meme flux
// previewArtist() + navigation. Meme mise en page ligne (image a gauche,
// nom + pays a droite) que ArtistListRow.tsx, pour rester coherent avec la
// liste des artistes suivis plutot qu'une grille de vignettes.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {artists.map((a) => (
          <button
            key={a.musicbrainz_id}
            onClick={() => open(a)}
            disabled={busyId === a.musicbrainz_id}
            className="flex items-center gap-3 px-3 py-2 rounded-md bg-app-bg border border-app-border hover:border-app-text-faint transition-colors text-left disabled:opacity-50"
            title={`Voir la fiche de ${a.name}`}
          >
            <span className="relative shrink-0">
              {a.image_url ? (
                <img src={a.image_url} alt="" className="w-9 h-9 rounded-full object-cover bg-app-surface-hover" />
              ) : (
                <span className="flex w-9 h-9 rounded-full bg-app-surface-hover items-center justify-center text-sm">🎤</span>
              )}
              {busyId === a.musicbrainz_id && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <Spinner className="w-4 h-4 text-white" />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{a.name}</div>
              {a.area_name && <div className="text-xs text-app-text-faint truncate">{a.area_name}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
