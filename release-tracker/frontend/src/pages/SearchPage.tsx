import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ALL_RELEASE_TYPES, api, type ArtistSearchResult } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'

const COUNTRY_OPTIONS: [string, string][] = [
  ['US', 'Etats-Unis'],
  ['GB', 'Royaume-Uni'],
  ['FR', 'France'],
  ['DE', 'Allemagne'],
  ['JP', 'Japon'],
  ['KR', 'Coree du Sud'],
  ['CA', 'Canada'],
  ['AU', 'Australie'],
  ['IT', 'Italie'],
  ['ES', 'Espagne'],
  ['SE', 'Suede'],
  ['NO', 'Norvege'],
  ['DK', 'Danemark'],
  ['FI', 'Finlande'],
  ['NL', 'Pays-Bas'],
  ['BE', 'Belgique'],
  ['BR', 'Bresil'],
  ['MX', 'Mexique'],
  ['IE', 'Irlande'],
  ['IS', 'Islande'],
  ['PT', 'Portugal'],
  ['PL', 'Pologne'],
  ['RU', 'Russie'],
  ['CN', 'Chine'],
  ['IN', 'Inde'],
  ['AT', 'Autriche'],
  ['CH', 'Suisse'],
  ['NZ', 'Nouvelle-Zelande'],
  ['AR', 'Argentine'],
  ['CO', 'Colombie'],
]

const TYPE_OPTIONS: [string, string][] = [
  ['Person', 'Personne (solo)'],
  ['Group', 'Groupe'],
  ['Orchestra', 'Orchestre'],
  ['Choir', 'Choeur'],
  ['Character', 'Personnage'],
  ['Other', 'Autre'],
]

export default function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const [country, setCountry] = useState('')
  const [artistType, setArtistType] = useState('')
  const [tag, setTag] = useState('')
  const [debouncedTag, setDebouncedTag] = useState('')
  const [results, setResults] = useState<ArtistSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const navigate = useNavigate()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)

  // Evite d'interroger MusicBrainz (limite a 1 req/s) a chaque frappe sur le
  // champ genre - seul le debounce declenche une recherche, pas chaque lettre.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTag(tag.trim()), 500)
    return () => window.clearTimeout(t)
  }, [tag])

  const loadPage = useCallback(
    (offset: number, requestId: number) => {
      const filters = { country: country || undefined, type: artistType || undefined, tag: debouncedTag || undefined }
      return api.searchArtists(query, offset, filters).then((page) => {
        if (requestId !== requestIdRef.current) return // reponse perimee (filtre change entre-temps)
        setResults((prev) => (offset === 0 ? page.results : [...prev, ...page.results]))
        setTotal(page.total)
      })
    },
    [query, country, artistType, debouncedTag]
  )

  // Recharge depuis le debut des que la recherche ou un filtre change (loadPage
  // change de reference dans ce cas, ce qui redeclenche cet effet).
  useEffect(() => {
    if (!query) {
      setResults([])
      setTotal(0)
      return
    }
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setLoading(true)
    setError(null)
    loadPage(0, requestId)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de recherche'))
      .finally(() => setLoading(false))
  }, [query, loadPage])

  // Pagination dynamique : charge la page suivante uniquement quand la
  // sentinelle en bas de liste devient visible, plutot que de tout charger
  // d'un coup (couteux cote MusicBrainz et cote rendu pour un artiste tres
  // demande avec des centaines de resultats).
  useEffect(() => {
    if (!query || loading) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && results.length < total) {
          const requestId = requestIdRef.current
          setLoadingMore(true)
          loadPage(results.length, requestId).finally(() => setLoadingMore(false))
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [query, loading, loadingMore, results.length, total, loadPage])

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

  const typeLabel = (t: string | null) => TYPE_OPTIONS.find(([v]) => v === t)?.[1] ?? t

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">
        {query ? `Resultats pour "${query}"` : 'Recherche d\'artistes'}
      </h1>
      {!query && <p className="text-neutral-400">Utilise la barre de recherche en haut de page.</p>}

      {query && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Tous les pays</option>
            {COUNTRY_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={artistType}
            onChange={(e) => setArtistType(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Tous les types</option>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Genre (ex: rock, synth-pop)..."
            className="bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {total > 0 && <span className="text-xs text-neutral-500 ml-auto">{total} resultat(s)</span>}
        </div>
      )}

      {loading && <LoadingBlock label="Recherche en cours..." />}
      {error && <p className="text-red-400">{error}</p>}
      {query && !loading && !error && results.length === 0 && (
        <p className="text-neutral-400">Aucun artiste ne correspond a cette recherche.</p>
      )}

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
                <div className="text-xs text-neutral-400 truncate">
                  {[r.area_name, typeLabel(r.artist_type)].filter(Boolean).join(' · ')}
                  {r.disambiguation && ` - ${r.disambiguation}`}
                </div>
              </div>
            </button>
            {r.already_followed ? (
              <span className="text-xs text-neutral-500 whitespace-nowrap">Deja suivi</span>
            ) : (
              <button
                onClick={() => follow(r)}
                disabled={busyId === r.musicbrainz_id}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
              >
                {busyId === r.musicbrainz_id && <Spinner className="w-3 h-3" />}
                Suivre
              </button>
            )}
          </div>
        ))}
      </div>

      <div ref={sentinelRef} />
      {loadingMore && <LoadingBlock label="Chargement de plus de resultats..." />}
    </div>
  )
}
