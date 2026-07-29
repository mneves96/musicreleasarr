import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Artist } from '../api'
import ArtistCard from '../components/ArtistCard'

export default function FollowedListPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .listFollowedArtists()
      .then(setArtists)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-neutral-400">Chargement...</p>

  if (artists.length === 0) {
    return (
      <div className="text-neutral-400">
        <p>Tu ne suis encore aucun artiste.</p>
        <p className="mt-2">
          Utilise la barre de recherche en haut, ou <Link to="/search" className="text-purple-400 hover:underline">clique ici</Link> pour en trouver un.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Artistes suivis ({artists.length})</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {artists.map((a) => (
          <ArtistCard key={a.id} artist={a} />
        ))}
      </div>
    </div>
  )
}
