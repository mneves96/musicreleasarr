import { useCallback, useEffect, useState } from 'react'
import { api, type TaggingItem, type TrackChoice } from '../api'
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

function BacklogRow({
  item,
  choices,
  edit,
  onEditChange,
  onConfirm,
  onDiscard,
  onRescan,
  busy,
}: {
  item: TaggingItem
  choices: TrackChoice[] | undefined
  edit: Edit
  onEditChange: (edit: Edit) => void
  onConfirm: () => void
  onDiscard: () => void
  onRescan: () => void
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

      {item.status === 'error' ? (
        <>
          <p className="text-xs text-red-400">{item.error_message}</p>
          <div className="flex gap-2">
            <button
              onClick={onRescan}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
            >
              Reessayer
            </button>
            <button
              onClick={onDiscard}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-red-900/50 disabled:opacity-50"
            >
              Ignorer
            </button>
          </div>
        </>
      ) : (
        <>
          {item.match_score != null ? (
            <p className="text-xs text-neutral-500">Correspondance proposee : {Math.round(item.match_score * 100)}%</p>
          ) : (
            <p className="text-xs text-neutral-500">Aucune proposition automatique - choisis une piste ou saisis-la a la main.</p>
          )}

          {choices && choices.length > 0 && (
            <select
              className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
              value=""
              onChange={(e) => {
                const track = choices[Number(e.target.value)]
                if (track) {
                  onEditChange({
                    trackTitle: track.title,
                    trackNumber: String(track.position),
                    discNumber: String(track.disc_number),
                  })
                }
              }}
            >
              <option value="" disabled>
                Choisir une piste dans la tracklist MusicBrainz...
              </option>
              {choices.map((track, idx) => (
                <option key={idx} value={idx}>
                  {track.disc_number > 1 ? `${track.disc_number}-` : ''}
                  {String(track.position).padStart(2, '0')}. {track.title}
                </option>
              ))}
            </select>
          )}

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
        </>
      )}
    </div>
  )
}

export default function BacklogPage() {
  const [items, setItems] = useState<TaggingItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [tracklists, setTracklists] = useState<Record<number, TrackChoice[]>>({})
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())

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

  // Charge la tracklist MusicBrainz une seule fois par release : plusieurs fichiers
  // du backlog partagent souvent le meme dossier source (MeTube telecharge tout un
  // artiste dans un seul dossier, voir services/tagging.py).
  useEffect(() => {
    if (!items) return
    const missing = [...new Set(items.filter((i) => i.status === 'needs_review').map((i) => i.release_id))].filter(
      (id) => !(id in tracklists),
    )
    if (missing.length === 0) return
    missing.forEach(async (releaseId) => {
      const item = items.find((i) => i.release_id === releaseId)
      if (!item) return
      try {
        const choices = await api.tagging.tracklist(item.id)
        setTracklists((prev) => ({ ...prev, [releaseId]: choices }))
      } catch {
        setTracklists((prev) => ({ ...prev, [releaseId]: [] }))
      }
    })
  }, [items, tracklists])

  function setBusy(id: number, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function confirmItem(item: TaggingItem) {
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

  async function discardItem(item: TaggingItem) {
    setBusy(item.id, true)
    setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev))
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

  if (items === null) return <LoadingBlock />

  const grouped = new Map<number, TaggingItem[]>()
  for (const item of items) {
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
        Fichiers telecharges via MeTube en attente de correction des tags et de rangement. Rien n'est ecrit sur le
        disque tant que tu n'as pas confirme la correspondance.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Rien a traiter pour le moment.</p>
      ) : (
        [...grouped.entries()].map(([releaseId, groupItems]) => (
          <div key={releaseId} className="mb-6">
            <h2 className="font-medium mb-2 text-neutral-300">
              {groupItems[0].artist_name} - {groupItems[0].release_title}
            </h2>
            <div className="flex flex-col gap-2">
              {groupItems.map((item) => (
                <BacklogRow
                  key={item.id}
                  item={item}
                  choices={tracklists[item.release_id]}
                  edit={edits[item.id] ?? editFromItem(item)}
                  onEditChange={(edit) => setEdits((prev) => ({ ...prev, [item.id]: edit }))}
                  onConfirm={() => confirmItem(item)}
                  onDiscard={() => discardItem(item)}
                  onRescan={() => rescanItem(item)}
                  busy={busyIds.has(item.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
