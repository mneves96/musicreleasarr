import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  api,
  RELEASE_TYPE_LABELS,
  type ArtistSearchResult,
  type ReleaseGroupChoice,
  type TaggingItem,
  type TrackChoice,
} from '../api'
import { TaggingBadge } from '../components/StatusBadge'
import Spinner, { LoadingBlock } from '../components/Spinner'

const POLL_MS = 15000

interface Edit {
  trackTitle: string
  trackNumber: string
  discNumber: string
}

function editFromItem(item: TaggingItem): Edit {
  return {
    trackTitle: item.suggested_track_title ?? '',
    trackNumber: item.suggested_track_number != null ? String(item.suggested_track_number) : '',
    discNumber: item.suggested_disc_number != null ? String(item.suggested_disc_number) : '',
  }
}

function trackKey(track: TrackChoice): number {
  return track.disc_number * 10000 + track.position
}

// Assignation initiale piste <- fichier a partir des suggestions du scan automatique
// (voir services/tagging.py:scan_artist) : meme principe que le pre-clustering de
// Picard, mais purement indicatif - rien n'est confirme tant que l'utilisateur n'a
// pas valide (glisser-deposer ou bouton Confirmer).
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

function FileChip({
  item,
  onDiscard,
  draggable = true,
}: {
  item: TaggingItem
  onDiscard: () => void
  draggable?: boolean
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(item.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      title={item.original_filename}
    >
      <span className="truncate flex-1">{item.original_filename}</span>
      {item.match_score != null && (
        <span className="text-[10px] text-neutral-500 whitespace-nowrap">{Math.round(item.match_score * 100)}%</span>
      )}
      <button onClick={onDiscard} className="text-neutral-500 hover:text-red-400 text-xs px-1" title="Ignorer ce fichier">
        ✕
      </button>
    </div>
  )
}

function TrackSlot({
  track,
  assignedItem,
  isDragOver,
  busy,
  onDragOver,
  onDragLeave,
  onDrop,
  onUnassign,
  onConfirm,
}: {
  track: TrackChoice
  assignedItem: TaggingItem | undefined
  isDragOver: boolean
  busy: boolean
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onUnassign: () => void
  onConfirm: () => void
}) {
  const label = `${track.disc_number > 1 ? `${track.disc_number}-` : ''}${String(track.position).padStart(2, '0')}. ${track.title}`
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-md border px-2 py-1.5 text-sm flex items-center gap-2 ${
        isDragOver
          ? 'border-purple-500 bg-purple-950/30'
          : assignedItem
            ? 'border-green-800 bg-green-950/20'
            : 'border-dashed border-neutral-700 bg-neutral-950/40'
      }`}
    >
      <span className="flex-1 min-w-0">
        <span className="text-neutral-200 truncate block">{label}</span>
        {assignedItem ? (
          <span className="text-xs text-green-400 truncate block" title={assignedItem.original_filename}>
            ← {assignedItem.original_filename}
          </span>
        ) : (
          <span className="text-xs text-neutral-600">Glisse un fichier ici...</span>
        )}
      </span>
      {assignedItem && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
            title="Taguer et ranger cette piste"
          >
            {busy && <Spinner className="w-3 h-3" />}
            Confirmer
          </button>
          <button
            onClick={onUnassign}
            disabled={busy}
            className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
            title="Detacher ce fichier"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function FallbackRow({
  item,
  edit,
  onEditChange,
  onConfirm,
  onDiscard,
  busy,
}: {
  item: TaggingItem
  edit: Edit
  onEditChange: (edit: Edit) => void
  onConfirm: () => void
  onDiscard: () => void
  busy: boolean
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-neutral-300 truncate" title={item.original_filename}>
          {item.original_filename}
        </span>
        <TaggingBadge status={item.status} error={item.error_message} />
      </div>
      <p className="text-xs text-neutral-500">
        Tracklist MusicBrainz indisponible pour cet album - saisis les informations a la main.
      </p>
      <div className="flex gap-2">
        <input
          value={edit.trackTitle}
          onChange={(e) => onEditChange({ ...edit, trackTitle: e.target.value })}
          placeholder="Titre de la piste"
          className="flex-1 bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
        />
        <input
          value={edit.trackNumber}
          onChange={(e) => onEditChange({ ...edit, trackNumber: e.target.value })}
          placeholder="N°"
          type="number"
          className="w-16 bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
        />
        <input
          value={edit.discNumber}
          onChange={(e) => onEditChange({ ...edit, discNumber: e.target.value })}
          placeholder="Disque"
          type="number"
          className="w-20 bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={busy || !edit.trackTitle.trim()}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
        >
          {busy && <Spinner className="w-3 h-3" />}
          Confirmer (taguer + ranger)
        </button>
        <button
          onClick={onDiscard}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-red-900/50 disabled:opacity-50"
        >
          Ignorer
        </button>
      </div>
    </div>
  )
}

type IdentifyStep = 'search' | 'artists' | 'releases'

// Panneau de recherche MusicBrainz pour rattacher un dossier "non identifie" a un
// artiste/album - l'equivalent du "Lookup" de Picard sur un cluster de fichiers
// qu'il n'a pas reussi a associer automatiquement a ta bibliotheque.
function IdentifyPanel({ sourceFolder, onIdentified }: { sourceFolder: string; onIdentified: () => void }) {
  const [query, setQuery] = useState(sourceFolder)
  const [step, setStep] = useState<IdentifyStep>('search')
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
      await api.tagging.identify({
        source_folder: sourceFolder,
        artist_musicbrainz_id: selectedArtist.musicbrainz_id,
        artist_name: selectedArtist.name,
        release_group_musicbrainz_id: rg.musicbrainz_id,
        release_title: rg.title,
        release_type: rg.release_type,
        release_date: rg.release_date,
      })
      onIdentified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-md p-3 flex flex-col gap-2 mt-2">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {step === 'search' && (
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchArtists()}
            placeholder="Nom de l'artiste"
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
            autoFocus
          />
          <button
            onClick={searchArtists}
            disabled={busy || !query.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
          >
            {busy ? '...' : 'Rechercher'}
          </button>
        </div>
      )}

      {step === 'artists' && (
        <div className="flex flex-col gap-1">
          <button onClick={() => setStep('search')} className="text-xs text-neutral-500 hover:text-white self-start">
            ← Nouvelle recherche
          </button>
          {busy && <p className="text-xs text-neutral-500">Chargement...</p>}
          {!busy && artists.length === 0 && <p className="text-xs text-neutral-500">Aucun resultat.</p>}
          {artists.map((a) => (
            <button
              key={a.musicbrainz_id}
              onClick={() => pickArtist(a)}
              disabled={busy}
              className="text-left text-sm px-2 py-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50"
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
              className="text-left text-sm px-2 py-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 flex items-center justify-between gap-2"
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
    </div>
  )
}

function UnclusteredFolder({
  sourceFolder,
  items,
  onDiscard,
  onIdentified,
}: {
  sourceFolder: string
  items: TaggingItem[]
  onDiscard: (item: TaggingItem) => void
  onIdentified: () => void
}) {
  const [identifying, setIdentifying] = useState(false)
  const label = sourceFolder ? `Dossier non identifie : ${sourceFolder}` : 'Fichiers en vrac (racine du dossier de telechargements)'

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-medium text-neutral-300">
          {label}{' '}
          <span className="text-neutral-500 text-sm">
            ({items.length} fichier{items.length > 1 ? 's' : ''})
          </span>
        </h2>
        <button
          onClick={() => setIdentifying((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700"
        >
          {identifying ? 'Annuler' : 'Identifier...'}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <FileChip key={item.id} item={item} onDiscard={() => onDiscard(item)} draggable={false} />
        ))}
      </div>
      {identifying && (
        <IdentifyPanel
          sourceFolder={sourceFolder}
          onIdentified={() => {
            setIdentifying(false)
            onIdentified()
          }}
        />
      )}
    </div>
  )
}

function ErrorRow({ item, onRescan, onDiscard, busy }: { item: TaggingItem; onRescan: () => void; onDiscard: () => void; busy: boolean }) {
  return (
    <div className="bg-neutral-900 border border-red-900/60 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-neutral-300 truncate">{item.original_filename}</div>
        <div className="text-xs text-red-400">{item.error_message}</div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onRescan} disabled={busy} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">
          Reessayer
        </button>
        <button onClick={onDiscard} disabled={busy} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-red-900/50 disabled:opacity-50">
          Ignorer
        </button>
      </div>
    </div>
  )
}

export default function BacklogPage() {
  const [items, setItems] = useState<TaggingItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [tracklists, setTracklists] = useState<Record<number, TrackChoice[] | null>>({})
  const [assignments, setAssignments] = useState<Record<number, Record<number, number>>>({})
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [busyReleaseIds, setBusyReleaseIds] = useState<Set<number>>(new Set())
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const backlog = await api.tagging.backlog()
      setItems(backlog)
      setLoadError(null)
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

  // Charge la tracklist MusicBrainz une seule fois par release (plusieurs fichiers du
  // backlog partagent souvent le meme dossier source - voir services/tagging.py), puis
  // initialise le pre-clustering (assignation suggeree) une fois la tracklist connue.
  useEffect(() => {
    if (!items) return
    const releaseIds = items
      .filter((i) => i.status === 'needs_review' && i.release_id != null)
      .map((i) => i.release_id as number)
    const missing = [...new Set(releaseIds)].filter((id) => !(id in tracklists))
    if (missing.length === 0) return
    missing.forEach(async (releaseId) => {
      const item = items.find((i) => i.release_id === releaseId)
      if (!item) return
      try {
        const choices = await api.tagging.tracklist(item.id)
        setTracklists((prev) => ({ ...prev, [releaseId]: choices.length > 0 ? choices : null }))
        if (choices.length > 0) {
          const releaseItems = items.filter((i) => i.release_id === releaseId)
          setAssignments((prev) => ({ ...prev, [releaseId]: prev[releaseId] ?? initialAssignment(releaseItems) }))
        }
      } catch {
        setTracklists((prev) => ({ ...prev, [releaseId]: null }))
      }
    })
  }, [items, tracklists])

  const itemsById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items])

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

  function assign(releaseId: number, key: number, itemId: number) {
    setAssignments((prev) => {
      const current = { ...(prev[releaseId] ?? {}) }
      // Un fichier ne peut occuper qu'une seule piste a la fois.
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

  async function confirmPair(item: TaggingItem, track: TrackChoice, releaseId: number, key: number) {
    setBusy(item.id, true)
    try {
      const updated = await api.tagging.confirm(item.id, {
        track_title: track.title,
        track_number: track.position,
        disc_number: track.disc_number,
        recording_id: track.recording_id,
      })
      if (updated.status === 'done') {
        setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev))
        unassign(releaseId, key)
      } else {
        setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? updated : i)) : prev))
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur lors de la confirmation')
    } finally {
      setBusy(item.id, false)
    }
  }

  async function confirmAlbum(releaseId: number, tracklist: TrackChoice[]) {
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
            })
          } catch {
            return null
          }
        }),
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
        setItems((prev) =>
          prev ? prev.map((i) => failedResults.find((r) => r!.id === i.id) ?? i) : prev,
        )
        setLoadError(`${failedResults.length} piste(s) n'ont pas pu etre rangees (voir les erreurs ci-dessous)`)
      }
    } finally {
      setReleaseBusy(releaseId, false)
    }
  }

  async function discardItem(item: TaggingItem, releaseId?: number) {
    setBusy(item.id, true)
    setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev))
    if (releaseId != null) {
      setAssignments((prev) => {
        const current = { ...(prev[releaseId] ?? {}) }
        for (const k of Object.keys(current)) {
          if (current[Number(k)] === item.id) delete current[Number(k)]
        }
        return { ...prev, [releaseId]: current }
      })
    }
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
      setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? updated : i)) : prev))
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
        setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? updated : i)) : prev))
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur lors de la confirmation')
    } finally {
      setBusy(item.id, false)
    }
  }

  if (items === null) return <LoadingBlock />

  const grouped = new Map<number, TaggingItem[]>()
  const unclustered = new Map<string, TaggingItem[]>()
  for (const item of items) {
    if (item.release_id == null) {
      const list = unclustered.get(item.source_folder) ?? []
      list.push(item)
      unclustered.set(item.source_folder, list)
      continue
    }
    const list = grouped.get(item.release_id) ?? []
    list.push(item)
    grouped.set(item.release_id, list)
  }

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
            title="Scanne immediatement le dossier de telechargements, sans attendre le job planifie (5 min)"
          >
            {scanning ? 'Scan...' : 'Scanner maintenant'}
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
        Fichiers telecharges en attente de correction des tags et de rangement. Glisse un fichier sur la piste
        correspondante (comme dans Picard), ou identifie un dossier inconnu via une recherche MusicBrainz - rien
        n'est ecrit sur le disque avant confirmation.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Rien a traiter pour le moment.</p>
      ) : (
        <>
          {[...unclustered.entries()].map(([sourceFolder, folderItems]) => (
            <UnclusteredFolder
              key={sourceFolder}
              sourceFolder={sourceFolder}
              items={folderItems}
              onDiscard={(item) => discardItem(item)}
              onIdentified={() => refresh()}
            />
          ))}
          {[...grouped.entries()].map(([releaseId, groupItems]) => {
          const tracklist = tracklists[releaseId]
          const assignment = assignments[releaseId] ?? {}
          const pending = groupItems.filter((i) => i.status === 'needs_review')
          const errors = groupItems.filter((i) => i.status === 'error')
          const assignedCount = Object.keys(assignment).length

          return (
            <div key={releaseId} className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-medium text-neutral-300">
                  {groupItems[0].artist_name} - {groupItems[0].release_title}
                </h2>
                {tracklist && tracklist.length > 0 && assignedCount > 0 && (
                  <button
                    onClick={() => confirmAlbum(releaseId, tracklist)}
                    disabled={busyReleaseIds.has(releaseId)}
                    className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
                  >
                    {busyReleaseIds.has(releaseId) && <Spinner className="w-3 h-3" />}
                    Confirmer l'album ({assignedCount} piste{assignedCount > 1 ? 's' : ''})
                  </button>
                )}
              </div>

              {tracklist === undefined && <p className="text-xs text-neutral-500">Chargement de la tracklist...</p>}

              {tracklist && tracklist.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="text-xs text-neutral-500 mb-1">Fichiers ({pending.filter((i) => !Object.values(assignment).includes(i.id)).length})</div>
                    {pending
                      .filter((i) => !Object.values(assignment).includes(i.id))
                      .map((item) => (
                        <FileChip key={item.id} item={item} onDiscard={() => discardItem(item, releaseId)} />
                      ))}
                    {pending.filter((i) => !Object.values(assignment).includes(i.id)).length === 0 && (
                      <p className="text-xs text-neutral-600 italic">Tous les fichiers sont assignes.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="text-xs text-neutral-500 mb-1">Pistes ({tracklist.length})</div>
                    {[...tracklist]
                      .sort((a, b) => a.disc_number - b.disc_number || a.position - b.position)
                      .map((track) => {
                        const key = trackKey(track)
                        const assignedItem = assignment[key] != null ? itemsById.get(assignment[key]) : undefined
                        const dragKey = `${releaseId}:${key}`
                        return (
                          <TrackSlot
                            key={key}
                            track={track}
                            assignedItem={assignedItem}
                            isDragOver={dragOverKey === dragKey}
                            busy={assignedItem ? busyIds.has(assignedItem.id) : false}
                            onDragOver={(e) => {
                              e.preventDefault()
                              setDragOverKey(dragKey)
                            }}
                            onDragLeave={() => setDragOverKey((k) => (k === dragKey ? null : k))}
                            onDrop={(e) => {
                              e.preventDefault()
                              setDragOverKey(null)
                              const itemId = Number(e.dataTransfer.getData('text/plain'))
                              if (itemId) assign(releaseId, key, itemId)
                            }}
                            onUnassign={() => unassign(releaseId, key)}
                            onConfirm={() => assignedItem && confirmPair(assignedItem, track, releaseId, key)}
                          />
                        )
                      })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {pending.map((item) => (
                    <FallbackRow
                      key={item.id}
                      item={item}
                      edit={edits[item.id] ?? editFromItem(item)}
                      onEditChange={(edit) => setEdits((prev) => ({ ...prev, [item.id]: edit }))}
                      onConfirm={() => confirmManual(item)}
                      onDiscard={() => discardItem(item)}
                      busy={busyIds.has(item.id)}
                    />
                  ))}
                </div>
              )}

              {errors.length > 0 && (
                <div className="flex flex-col gap-2 mt-3">
                  {errors.map((item) => (
                    <ErrorRow
                      key={item.id}
                      item={item}
                      onRescan={() => rescanItem(item)}
                      onDiscard={() => discardItem(item, releaseId)}
                      busy={busyIds.has(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        </>
      )}
    </div>
  )
}
