import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  RELEASE_TYPE_LABELS,
  type ArtistSearchResult,
  type ReleaseCard,
  type ReleaseGroupChoice,
  type TaggingItem,
  type TaggingSearchScope,
  type TrackChoice,
} from '../api'
import AlbumCard, { type AlbumDropPayload, editFromItem, trackKey, type Edit } from '../components/AlbumCard'
import FileTree from '../components/FileTree'
import Spinner, { LoadingBlock } from '../components/Spinner'

const POLL_MS = 15000
const COLUMN_HEIGHT = 'calc(100vh - 15rem)'

// Pre-clustering initial a partir des suggestions du scan/de la recherche
// (voir services/tagging.py) : purement indicatif, rien n'est confirme tant
// que l'utilisateur n'a pas valide (glisser-deposer ou bouton Confirmer).
function initialAssignment(items: TaggingItem[]): Record<number, number> {
  const assignment: Record<number, number> = {}
  const used = new Set<number>()
  const sorted = [...items]
    .filter((i) => i.status === 'needs_review' && i.suggested_track_number != null)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
  for (const item of sorted) {
    const key = (item.suggested_disc_number ?? 1) * 10000 + (item.suggested_track_number ?? 0)
    if (used.has(key)) continue
    assignment[key] = item.id
    used.add(key)
  }
  return assignment
}

function releaseCardFromItem(item: TaggingItem): ReleaseCard | null {
  if (item.release_id == null) return null
  return {
    release_id: item.release_id,
    artist_name: item.artist_name ?? '',
    release_title: item.release_title ?? '',
    cover_url: item.release_cover_url,
    release_date: item.release_date,
    release_type: 'other',
  }
}

type ReleaseSearchStep = 'search' | 'artists' | 'releases'

// Recherche manuelle d'un album a ajouter a la colonne de droite (meme flux
// que la recherche d'artiste globale : artiste -> release), avec le panneau
// d'autocomplete positionne en overlay pour ne jamais pousser la liste des
// albums vers le bas.
function ReleaseSearchBar({ onAdded }: { onAdded: (card: ReleaseCard) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ReleaseSearchStep>('search')
  const [artists, setArtists] = useState<ArtistSearchResult[]>([])
  const [selectedArtist, setSelectedArtist] = useState<ArtistSearchResult | null>(null)
  const [releaseGroups, setReleaseGroups] = useState<ReleaseGroupChoice[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function searchArtists() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      const page = await api.searchArtists(query.trim())
      setArtists(page.results)
      setStep('artists')
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function pickArtist(artist: ArtistSearchResult) {
    setSelectedArtist(artist)
    setBusy(true)
    setError(null)
    try {
      const groups = await api.tagging.releaseGroups(artist.musicbrainz_id)
      setReleaseGroups(groups)
      setStep('releases')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function pickRelease(rg: ReleaseGroupChoice) {
    if (!selectedArtist) return
    setBusy(true)
    setError(null)
    try {
      const card = await api.tagging.createRelease({
        artist_musicbrainz_id: selectedArtist.musicbrainz_id,
        artist_name: selectedArtist.name,
        release_group_musicbrainz_id: rg.musicbrainz_id,
        release_title: rg.title,
        release_type: rg.release_type,
        release_date: rg.release_date,
      })
      onAdded(card)
      setOpen(false)
      setStep('search')
      setQuery('')
      setSelectedArtist(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative mb-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim()) setOpen(true)
          }}
          onKeyDown={(e) => e.key === 'Enter' && searchArtists()}
          placeholder="Ajouter un album (recherche artiste)..."
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={searchArtists}
          disabled={busy || !query.trim()}
          className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? '...' : 'Rechercher'}
        </button>
      </div>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-neutral-950 border border-neutral-700 rounded-md p-2 shadow-lg max-h-80 overflow-y-auto">
          {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
          {step === 'artists' && (
            <div className="flex flex-col gap-1">
              {busy && <p className="text-xs text-neutral-500">Chargement...</p>}
              {!busy && artists.length === 0 && <p className="text-xs text-neutral-500">Aucun resultat.</p>}
              {artists.map((a) => (
                <button
                  key={a.musicbrainz_id}
                  onClick={() => pickArtist(a)}
                  disabled={busy}
                  className="text-left text-sm px-2 py-1.5 rounded-md hover:bg-neutral-900 disabled:opacity-50"
                >
                  {a.name} {a.disambiguation && <span className="text-neutral-500">({a.disambiguation})</span>}
                </button>
              ))}
            </div>
          )}
          {step === 'releases' && (
            <div className="flex flex-col gap-1">
              <button onClick={() => setStep('artists')} className="text-xs text-neutral-500 hover:text-white self-start">
                ← Autre artiste
              </button>
              {busy && <p className="text-xs text-neutral-500">Chargement...</p>}
              {!busy && releaseGroups.length === 0 && <p className="text-xs text-neutral-500">Aucune release trouvee.</p>}
              {releaseGroups.map((rg) => (
                <button
                  key={rg.musicbrainz_id}
                  onClick={() => pickRelease(rg)}
                  disabled={busy}
                  className="text-left text-sm px-2 py-1.5 rounded-md hover:bg-neutral-900 disabled:opacity-50 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{rg.title}</span>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    {RELEASE_TYPE_LABELS[rg.release_type]}
                    {rg.release_date ? ` - ${rg.release_date.slice(0, 4)}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setOpen(false)} className="text-xs text-neutral-500 hover:text-white mt-2">
            Fermer
          </button>
        </div>
      )}
    </div>
  )
}

export default function BacklogPage() {
  const [items, setItems] = useState<TaggingItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [searchScope, setSearchScope] = useState<TaggingSearchScope>('followed')
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState<string | null>(null)

  const [openReleases, setOpenReleases] = useState<Map<number, ReleaseCard>>(new Map())
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [tracklists, setTracklists] = useState<Record<number, TrackChoice[] | null>>({})
  const [assignments, setAssignments] = useState<Record<number, Record<number, number>>>({})
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [busyReleaseIds, setBusyReleaseIds] = useState<Set<number>>(new Set())

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const backlog = await api.tagging.backlog()
      setItems(backlog)
      setLoadError(null)
      setOpenReleases((prev) => {
        const next = new Map(prev)
        for (const item of backlog) {
          const card = releaseCardFromItem(item)
          if (card && !next.has(card.release_id)) next.set(card.release_id, card)
        }
        return next
      })
      setEdits((prev) => {
        const next = { ...prev }
        for (const item of backlog) {
          if (!next[item.id]) next[item.id] = editFromItem(item)
        }
        return next
      })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      if (showSpinner) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = window.setInterval(() => refresh(), POLL_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  // Charge la tracklist MusicBrainz une seule fois par album ouvert (y compris
  // les cartes vides ajoutees via la recherche manuelle, avant tout fichier
  // rattache - voir routers/tagging.py:release_tracklist), puis initialise le
  // pre-clustering des qu'elle est connue.
  useEffect(() => {
    if (!items) return
    const releaseIds = [...openReleases.keys()]
    const missing = releaseIds.filter((id) => !(id in tracklists))
    if (missing.length === 0) return
    missing.forEach(async (releaseId) => {
      try {
        const choices = await api.tagging.tracklist(releaseId)
        setTracklists((prev) => ({ ...prev, [releaseId]: choices.length > 0 ? choices : null }))
        if (choices.length > 0) {
          const releaseItems = items.filter((i) => i.release_id === releaseId)
          setAssignments((prev) => ({ ...prev, [releaseId]: prev[releaseId] ?? initialAssignment(releaseItems) }))
        }
      } catch {
        setTracklists((prev) => ({ ...prev, [releaseId]: null }))
      }
    })
  }, [items, openReleases, tracklists])

  const itemsById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items])
  const unclusteredItems = useMemo(() => (items ?? []).filter((i) => i.release_id == null), [items])

  async function scanNow() {
    setScanning(true)
    setScanMessage(null)
    try {
      const result = await api.tagging.scanNow()
      setScanMessage(result.message)
      await refresh()
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setScanning(false)
    }
  }

  function setBusy(id: number, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function setReleaseBusy(id: number, busy: boolean) {
    setBusyReleaseIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelect(ids: number[], selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function assign(releaseId: number, key: number, itemId: number) {
    setAssignments((prev) => {
      const current = { ...(prev[releaseId] ?? {}) }
      for (const k of Object.keys(current)) {
        if (current[Number(k)] === itemId) delete current[Number(k)]
      }
      current[key] = itemId
      return { ...prev, [releaseId]: current }
    })
  }

  function unassign(releaseId: number, key: number) {
    setAssignments((prev) => {
      const current = { ...(prev[releaseId] ?? {}) }
      delete current[key]
      return { ...prev, [releaseId]: current }
    })
  }

  // Apres une recherche/un glisser-deposer, integre les correspondances de
  // piste trouvees cote serveur dans le pre-clustering client, sans ecraser
  // une assignation deja en place sur le meme slot.
  function mergeAssignmentFromItems(releaseId: number, releaseItems: TaggingItem[]) {
    setAssignments((prev) => {
      const current = { ...(prev[releaseId] ?? {}) }
      const used = new Set(Object.values(current))
      for (const item of releaseItems) {
        if (item.status !== 'needs_review' || item.suggested_track_number == null || used.has(item.id)) continue
        const key = (item.suggested_disc_number ?? 1) * 10000 + item.suggested_track_number
        if (current[key] != null) continue
        current[key] = item.id
        used.add(item.id)
      }
      return { ...prev, [releaseId]: current }
    })
  }

  function removeFromAssignments(itemIds: number[], exceptReleaseId?: number) {
    setAssignments((prev) => {
      const next = { ...prev }
      for (const [relIdStr, assignment] of Object.entries(next)) {
        const relId = Number(relIdStr)
        if (relId === exceptReleaseId) continue
        let changed = false
        const cleaned = { ...assignment }
        for (const k of Object.keys(cleaned)) {
          if (itemIds.includes(cleaned[Number(k)])) {
            delete cleaned[Number(k)]
            changed = true
          }
        }
        if (changed) next[relId] = cleaned
      }
      return next
    })
  }

  function mergeUpdatedItems(updated: TaggingItem[]) {
    setItems((prev) => {
      if (!prev) return prev
      const byId = new Map(updated.map((u) => [u.id, u]))
      return prev.map((i) => byId.get(i.id) ?? i)
    })
  }

  async function confirmPair(item: TaggingItem, track: TrackChoice, releaseId: number, key: number) {
    setBusy(item.id, true)
    try {
      const updated = await api.tagging.confirm(item.id, {
        track_title: track.title,
        track_number: track.position,
        disc_number: track.disc_number,
        recording_id: track.recording_id,
        release_mbid: track.release_mbid,
      })
      if (updated.status === 'done') {
        setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev))
        unassign(releaseId, key)
      } else {
        mergeUpdatedItems([updated])
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur lors de la confirmation')
    } finally {
      setBusy(item.id, false)
    }
  }

  async function confirmAlbum(releaseId: number) {
    const tracklist = tracklists[releaseId]
    if (!tracklist) return
    const assignment = assignments[releaseId] ?? {}
    const pairs = tracklist
      .map((track) => ({ track, itemId: assignment[trackKey(track)] }))
      .filter((p): p is { track: TrackChoice; itemId: number } => p.itemId != null)
    if (pairs.length === 0) return
    setReleaseBusy(releaseId, true)
    try {
      const results = await Promise.all(
        pairs.map(async ({ track, itemId }) => {
          const item = itemsById.get(itemId)
          if (!item) return null
          try {
            return await api.tagging.confirm(itemId, {
              track_title: track.title,
              track_number: track.position,
              disc_number: track.disc_number,
              recording_id: track.recording_id,
              release_mbid: track.release_mbid,
            })
          } catch {
            return null
          }
        })
      )
      const doneIds = new Set(results.filter((r) => r?.status === 'done').map((r) => r!.id))
      if (doneIds.size > 0) {
        setItems((prev) => (prev ? prev.filter((i) => !doneIds.has(i.id)) : prev))
        setAssignments((prev) => {
          const current = { ...(prev[releaseId] ?? {}) }
          for (const k of Object.keys(current)) {
            if (doneIds.has(current[Number(k)])) delete current[Number(k)]
          }
          return { ...prev, [releaseId]: current }
        })
      }
      const failedResults = results.filter((r) => r && r.status !== 'done')
      if (failedResults.length > 0) {
        mergeUpdatedItems(failedResults as TaggingItem[])
        setLoadError(`${failedResults.length} piste(s) n'ont pas pu etre rangees (voir les erreurs ci-dessous)`)
      }
    } finally {
      setReleaseBusy(releaseId, false)
    }
  }

  async function discardItem(item: TaggingItem) {
    setBusy(item.id, true)
    setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev))
    if (item.release_id != null) removeFromAssignments([item.id])
    setSelectedIds((prev) => {
      if (!prev.has(item.id)) return prev
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })
    try {
      await api.tagging.discard(item.id)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur')
      refresh()
    } finally {
      setBusy(item.id, false)
    }
  }

  async function rescanItem(item: TaggingItem) {
    setBusy(item.id, true)
    try {
      const updated = await api.tagging.rescan(item.id)
      mergeUpdatedItems([updated])
      setEdits((prev) => ({ ...prev, [item.id]: editFromItem(updated) }))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(item.id, false)
    }
  }

  async function confirmManual(item: TaggingItem) {
    const edit = edits[item.id]
    if (!edit?.trackTitle.trim()) return
    setBusy(item.id, true)
    try {
      const updated = await api.tagging.confirm(item.id, {
        track_title: edit.trackTitle.trim(),
        track_number: edit.trackNumber ? Number(edit.trackNumber) : null,
        disc_number: edit.discNumber ? Number(edit.discNumber) : null,
      })
      if (updated.status === 'done') {
        setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev))
      } else {
        mergeUpdatedItems([updated])
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur lors de la confirmation')
    } finally {
      setBusy(item.id, false)
    }
  }

  async function searchSelected() {
    if (selectedIds.size === 0) return
    const requested = selectedIds.size
    setSearching(true)
    setSearchMessage(null)
    try {
      const matched = await api.tagging.search([...selectedIds], searchScope)
      if (matched.length > 0) {
        mergeUpdatedItems(matched)
        setOpenReleases((prev) => {
          const next = new Map(prev)
          for (const m of matched) {
            const card = releaseCardFromItem(m)
            if (card && !next.has(card.release_id)) next.set(card.release_id, card)
          }
          return next
        })
        // Regroupe les fichiers nouvellement trouves par album et alimente
        // leur pre-clustering (piste <- fichier) - sans ca, une recherche qui
        // matche des fichiers vers un album deja ouvert (dont la tracklist a
        // deja ete chargee lors d'une recherche precedente) les laissait
        // bloques indefiniment en "Sans correspondance", jamais repris par
        // "Confirmer l'album" : l'effet de chargement de tracklist n'appelle
        // initialAssignment() qu'une seule fois par album, a la toute
        // premiere fois qu'il s'ouvre.
        const byRelease = new Map<number, TaggingItem[]>()
        for (const m of matched) {
          if (m.release_id == null) continue
          const list = byRelease.get(m.release_id) ?? []
          list.push(m)
          byRelease.set(m.release_id, list)
        }
        for (const [releaseId, releaseItems] of byRelease) {
          mergeAssignmentFromItems(releaseId, releaseItems)
        }
        const matchedIds = matched.map((m) => m.id)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (const id of matchedIds) next.delete(id)
          return next
        })
      }
      setSearchMessage(
        matched.length === 0 ? 'Aucune correspondance trouvee.' : `${matched.length}/${requested} fichier(s) trouve(s).`
      )
    } catch (err) {
      setSearchMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSearching(false)
    }
  }

  async function deleteAlbum(releaseId: number) {
    setReleaseBusy(releaseId, true)
    try {
      const updated = await api.tagging.unlinkRelease(releaseId)
      mergeUpdatedItems(updated)
      setOpenReleases((prev) => {
        const next = new Map(prev)
        next.delete(releaseId)
        return next
      })
      setAssignments((prev) => {
        const next = { ...prev }
        delete next[releaseId]
        return next
      })
      setTracklists((prev) => {
        const next = { ...prev }
        delete next[releaseId]
        return next
      })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setReleaseBusy(releaseId, false)
    }
  }

  async function dropOnRelease(targetReleaseId: number, payload: AlbumDropPayload) {
    let itemIds: number[]
    if (payload.type === 'file') {
      itemIds = [payload.itemId]
    } else if (payload.type === 'folder') {
      itemIds = payload.itemIds
    } else {
      if (payload.releaseId === targetReleaseId) return
      itemIds = (items ?? []).filter((i) => i.release_id === payload.releaseId && i.status !== 'done').map((i) => i.id)
    }
    if (itemIds.length === 0) return

    try {
      const updated = await api.tagging.assignItemsToRelease(targetReleaseId, itemIds)
      mergeUpdatedItems(updated)
      removeFromAssignments(itemIds, targetReleaseId)
      mergeAssignmentFromItems(targetReleaseId, updated)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of itemIds) next.delete(id)
        return next
      })
      if (payload.type === 'album') {
        setOpenReleases((prev) => {
          const next = new Map(prev)
          next.delete(payload.releaseId)
          return next
        })
        setAssignments((prev) => {
          const next = { ...prev }
          delete next[payload.releaseId]
          return next
        })
        setTracklists((prev) => {
          const next = { ...prev }
          delete next[payload.releaseId]
          return next
        })
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur lors du glisser-deposer')
    }
  }

  if (items === null) return <LoadingBlock />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Backlog</h1>
        <div className="flex items-center gap-3">
          {loadError && <span className="text-xs text-red-400">{loadError}</span>}
          {scanMessage && <span className="text-xs text-neutral-400">{scanMessage}</span>}
          <button
            onClick={scanNow}
            disabled={scanning}
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
            title="Relit le contenu du dossier de telechargements (aucun appel a MusicBrainz), sans attendre le job planifie (5 min)"
          >
            {scanning ? 'Actualisation...' : 'Actualiser les fichiers'}
          </button>
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
          >
            {refreshing ? 'Actualisation...' : '↻ Actualiser'}
          </button>
        </div>
      </div>

      <p className="text-sm text-neutral-400 mb-4">
        Selectionne des fichiers/dossiers a gauche pour les rechercher sur MusicBrainz, ou glisse-les directement sur
        un album a droite (comme dans Picard) - rien n'est ecrit sur le disque avant confirmation.
      </p>

      <div className="flex gap-4" style={{ height: COLUMN_HEIGHT }}>
        <div className="w-1/2 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
            <div className="flex rounded-md overflow-hidden border border-neutral-700 shrink-0">
              <button
                onClick={() => setSearchScope('followed')}
                className={`text-xs px-3 py-1.5 ${searchScope === 'followed' ? 'bg-neutral-700' : 'bg-neutral-900 text-neutral-400'}`}
              >
                Artistes suivis
              </button>
              <button
                onClick={() => setSearchScope('musicbrainz')}
                className={`text-xs px-3 py-1.5 ${searchScope === 'musicbrainz' ? 'bg-neutral-700' : 'bg-neutral-900 text-neutral-400'}`}
              >
                Tout MusicBrainz
              </button>
            </div>
            <button
              onClick={searchSelected}
              disabled={selectedIds.size === 0 || searching}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 whitespace-nowrap"
            >
              {searching && <Spinner className="w-3 h-3" />}
              Rechercher ({selectedIds.size})
            </button>
            {searchMessage && <span className="text-xs text-neutral-500">{searchMessage}</span>}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 border border-neutral-800 rounded-lg bg-neutral-950/40 p-2">
            <FileTree items={unclusteredItems} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
          </div>
        </div>

        <div className="w-1/2 flex flex-col min-h-0">
          <ReleaseSearchBar
            onAdded={(card) =>
              setOpenReleases((prev) => {
                const next = new Map(prev)
                next.set(card.release_id, card)
                return next
              })
            }
          />
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {openReleases.size === 0 ? (
              <p className="text-sm text-neutral-500">Aucun album ouvert - selectionne des fichiers a gauche et lance une recherche.</p>
            ) : (
              [...openReleases.values()].map((release) => (
                <AlbumCard
                  key={release.release_id}
                  release={release}
                  items={items.filter((i) => i.release_id === release.release_id)}
                  tracklist={tracklists[release.release_id]}
                  assignment={assignments[release.release_id] ?? {}}
                  itemsById={itemsById}
                  busy={busyReleaseIds.has(release.release_id)}
                  busyIds={busyIds}
                  edits={edits}
                  onAssign={(key, itemId) => assign(release.release_id, key, itemId)}
                  onUnassign={(key) => unassign(release.release_id, key)}
                  onConfirmPair={(item, track, key) => confirmPair(item, track, release.release_id, key)}
                  onConfirmAlbum={() => confirmAlbum(release.release_id)}
                  onDiscard={discardItem}
                  onRescan={rescanItem}
                  onEditChange={(itemId, edit) => setEdits((prev) => ({ ...prev, [itemId]: edit }))}
                  onConfirmManual={confirmManual}
                  onDelete={() => deleteAlbum(release.release_id)}
                  onDrop={(payload) => dropOnRelease(release.release_id, payload)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
