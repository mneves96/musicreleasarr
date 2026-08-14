import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ALL_RELEASE_TYPES, api, type ArtistSearchResult } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'
import { useLanguage } from '../context/LanguageContext'
import type { TranslationKey } from '../i18n/en'

const COUNTRY_OPTIONS: [string, TranslationKey][] = [
  ['US', 'search.country.US'],
  ['GB', 'search.country.GB'],
  ['FR', 'search.country.FR'],
  ['DE', 'search.country.DE'],
  ['JP', 'search.country.JP'],
  ['KR', 'search.country.KR'],
  ['CA', 'search.country.CA'],
  ['AU', 'search.country.AU'],
  ['IT', 'search.country.IT'],
  ['ES', 'search.country.ES'],
  ['SE', 'search.country.SE'],
  ['NO', 'search.country.NO'],
  ['DK', 'search.country.DK'],
  ['FI', 'search.country.FI'],
  ['NL', 'search.country.NL'],
  ['BE', 'search.country.BE'],
  ['BR', 'search.country.BR'],
  ['MX', 'search.country.MX'],
  ['IE', 'search.country.IE'],
  ['IS', 'search.country.IS'],
  ['PT', 'search.country.PT'],
  ['PL', 'search.country.PL'],
  ['RU', 'search.country.RU'],
  ['CN', 'search.country.CN'],
  ['IN', 'search.country.IN'],
  ['AT', 'search.country.AT'],
  ['CH', 'search.country.CH'],
  ['NZ', 'search.country.NZ'],
  ['AR', 'search.country.AR'],
  ['CO', 'search.country.CO'],
]

const TYPE_OPTIONS: [string, TranslationKey][] = [
  ['Person', 'search.type.person'],
  ['Group', 'search.type.group'],
  ['Orchestra', 'search.type.orchestra'],
  ['Choir', 'search.type.choir'],
  ['Character', 'search.type.character'],
  ['Other', 'search.type.other'],
]

export default function SearchPage() {
  const { t } = useLanguage()
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
    const timeout = window.setTimeout(() => setDebouncedTag(tag.trim()), 500)
    return () => window.clearTimeout(timeout)
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
      .catch((err) => setError(err instanceof Error ? err.message : t('search.searchError')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t stable en pratique, deps volontairement omises
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
      setError(err instanceof Error ? err.message : t('search.followError'))
      setBusyId(null)
    }
  }

  async function view(result: ArtistSearchResult) {
    setBusyId(result.musicbrainz_id)
    try {
      const artist = await api.previewArtist(result.musicbrainz_id)
      navigate(`/artists/${artist.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('search.openError'))
      setBusyId(null)
    }
  }

  const typeLabel = (type: string | null) => {
    const key = TYPE_OPTIONS.find(([v]) => v === type)?.[1]
    return key ? t(key) : type
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">
        {query ? t('search.resultsFor', { query }) : t('search.title')}
      </h1>
      {!query && <p className="text-app-text-muted">{t('search.useSearchBar')}</p>}

      {query && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="bg-app-surface border border-app-border-strong rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">{t('search.allCountries')}</option>
            {COUNTRY_OPTIONS.map(([code, labelKey]) => (
              <option key={code} value={code}>
                {t(labelKey)}
              </option>
            ))}
          </select>
          <select
            value={artistType}
            onChange={(e) => setArtistType(e.target.value)}
            className="bg-app-surface border border-app-border-strong rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">{t('search.allTypesOption')}</option>
            {TYPE_OPTIONS.map(([value, labelKey]) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder={t('search.genrePlaceholder')}
            className="bg-app-surface border border-app-border-strong rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
          />
          {total > 0 && <span className="text-xs text-app-text-faint ml-auto">{t('search.resultsCount', { count: total })}</span>}
        </div>
      )}

      {loading && <LoadingBlock label={t('search.searching')} />}
      {error && <p className="text-red-400">{error}</p>}
      {query && !loading && !error && results.length === 0 && (
        <p className="text-app-text-muted">{t('search.noMatch')}</p>
      )}

      <div className="flex flex-col gap-2">
        {results.map((r) => (
          <div
            key={r.musicbrainz_id}
            className="flex items-center gap-3 p-3 rounded-lg bg-app-surface border border-app-border"
          >
            <button
              onClick={() => view(r)}
              disabled={busyId === r.musicbrainz_id}
              className="flex items-center gap-3 min-w-0 flex-1 text-left disabled:opacity-50"
              title={t('search.viewArtistTitle')}
            >
              {r.image_url ? (
                <img src={r.image_url} alt="" className="w-10 h-10 rounded-full object-cover bg-app-surface-hover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-app-surface-hover flex items-center justify-center text-base shrink-0">🎤</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate hover:underline">{r.name}</div>
                <div className="text-xs text-app-text-muted truncate">
                  {[r.area_name, typeLabel(r.artist_type)].filter(Boolean).join(' · ')}
                  {r.disambiguation && ` - ${r.disambiguation}`}
                </div>
              </div>
            </button>
            {r.already_followed ? (
              <span className="text-xs text-app-text-faint whitespace-nowrap">{t('search.alreadyFollowed')}</span>
            ) : (
              <button
                onClick={() => follow(r)}
                disabled={busyId === r.musicbrainz_id}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50 whitespace-nowrap"
              >
                {busyId === r.musicbrainz_id && <Spinner className="w-3 h-3" />}
                {t('search.follow')}
              </button>
            )}
          </div>
        ))}
      </div>

      <div ref={sentinelRef} />
      {loadingMore && <LoadingBlock label={t('search.loadingMore')} />}
    </div>
  )
}
