import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Artist, ArtistSortBy } from '../api'
import ArtistCard from './ArtistCard'
import ArtistListRow from './ArtistListRow'
import Spinner, { LoadingBlock } from './Spinner'

type ViewMode = 'grid' | 'list'

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 300

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = localStorage.getItem(key)
  return (allowed as readonly string[]).includes(stored ?? '') ? (stored as T) : fallback
}

export interface ArtistPageResult {
  results: Artist[]
  total: number
}

// Grille/liste triable, filtrable et a defilement infini, partagee entre
// l'onglet Suivis (FollowedListPage) et l'onglet Recommandations Last.fm
// (RecommendedArtistsPage) - les deux listent le meme type Artist, seule la
// source des donnees differe. La pagination cote serveur (voir
// routers/artists.py) evite de charger + trier des centaines d'artistes en
// une fois, source de lenteur signalee sur de grosses bibliotheques.
export default function ArtistListView({
  storageKeyPrefix,
  fetchPage,
  emptyMessage,
  emptyFilterMessage = 'Aucun artiste ne correspond au filtre.',
  reloadToken,
  onTotalChange,
  onError,
}: {
  storageKeyPrefix: string
  fetchPage: (params: { offset: number; limit: number; q: string; sort: ArtistSortBy }) => Promise<ArtistPageResult>
  // Affiche a la place de la liste (recherche/tri/vue masques aussi, rien a
  // filtrer/trier) quand il n'y a vraiment aucun artiste, filtre vide -
  // distinct de emptyFilterMessage (liste non vide au total, juste aucune
  // correspondance pour le filtre en cours) : sans cette distinction, le
  // parent ne pouvait pas savoir si total=0 venait d'un filtre actif ou d'une
  // liste reellement vide, et masquait toute la vue (barre de recherche
  // comprise) des qu'un filtre ne matchait rien - le seul moyen de revenir
  // en arriere etait de recharger la page.
  emptyMessage?: ReactNode
  emptyFilterMessage?: string
  reloadToken?: unknown
  onTotalChange?: (total: number) => void
  onError?: (err: unknown) => void
}) {
  const [view, setView] = useState<ViewMode>(() =>
    readStored(`${storageKeyPrefix}.view`, ['grid', 'list'] as const, 'grid')
  )
  const [sortBy, setSortBy] = useState<ArtistSortBy>(() =>
    readStored(`${storageKeyPrefix}.sortBy`, ['name', 'albums', 'latest'] as const, 'name')
  )
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Artist[]>([])
  const [total, setTotal] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    localStorage.setItem(`${storageKeyPrefix}.view`, view)
  }, [view, storageKeyPrefix])

  useEffect(() => {
    localStorage.setItem(`${storageKeyPrefix}.sortBy`, sortBy)
  }, [sortBy, storageKeyPrefix])

  // Debounce de la recherche : evite une requete par frappe.
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(queryInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [queryInput])

  // Recharge depuis le debut des que le tri, la recherche ou reloadToken
  // change - la pagination accumulee jusque-la n'est plus valide.
  useEffect(() => {
    const seq = ++requestSeq.current
    setInitialLoading(true)
    fetchPage({ offset: 0, limit: PAGE_SIZE, q: query, sort: sortBy })
      .then((page) => {
        if (seq !== requestSeq.current) return
        setItems(page.results)
        setTotal(page.total)
        onTotalChange?.(page.total)
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return
        onError?.(err)
      })
      .finally(() => {
        if (seq === requestSeq.current) setInitialLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPage/onTotalChange/onError sont stables par convention d'appel
  }, [query, sortBy, reloadToken])

  const loadMore = useCallback(() => {
    if (loadingMore || initialLoading || items.length >= total) return
    const seq = requestSeq.current
    setLoadingMore(true)
    fetchPage({ offset: items.length, limit: PAGE_SIZE, q: query, sort: sortBy })
      .then((page) => {
        if (seq !== requestSeq.current) return
        setItems((prev) => [...prev, ...page.results])
        setTotal(page.total)
      })
      .finally(() => setLoadingMore(false))
  }, [fetchPage, initialLoading, items.length, loadingMore, query, sortBy, total])

  // Scroll infini : declenche loadMore() quand la sentinelle en bas de liste
  // devient visible, avec une marge pour anticiper avant d'atteindre le bas exact.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  if (!initialLoading && total === 0 && query.trim() === '' && emptyMessage) {
    return <>{emptyMessage}</>
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Filtrer par nom..."
          className="bg-app-surface border border-app-border-strong rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as ArtistSortBy)}
          className="bg-app-surface border border-app-border-strong rounded-md px-2 py-1.5 text-sm"
        >
          <option value="name">Trier : Nom (A-Z)</option>
          <option value="albums">Trier : Nombre d'albums</option>
          <option value="latest">Trier : Sortie la plus recente</option>
        </select>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setView('grid')}
            className={`text-xs px-3 py-1.5 rounded-md ${view === 'grid' ? 'bg-app-border-strong' : 'bg-app-surface text-app-text-muted'}`}
          >
            Details
          </button>
          <button
            onClick={() => setView('list')}
            className={`text-xs px-3 py-1.5 rounded-md ${view === 'list' ? 'bg-app-border-strong' : 'bg-app-surface text-app-text-muted'}`}
          >
            Liste
          </button>
        </div>
      </div>

      {initialLoading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <p className="text-app-text-muted text-sm">{emptyFilterMessage}</p>
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {items.map((a) => (
                <ArtistListRow key={a.id} artist={a} />
              ))}
            </div>
          )}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Spinner className="w-5 h-5" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
