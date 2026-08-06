import { type DragEvent, useState } from 'react'
import type { ReleaseCard, TaggingItem, TrackChoice } from '../api'
import { TaggingBadge } from './StatusBadge'
import Spinner from './Spinner'
import type { DragPayload } from './FileTree'

export interface Edit {
  trackTitle: string
  trackNumber: string
  discNumber: string
}

export function editFromItem(item: TaggingItem): Edit {
  return {
    trackTitle: item.suggested_track_title ?? '',
    trackNumber: item.suggested_track_number != null ? String(item.suggested_track_number) : '',
    discNumber: item.suggested_disc_number != null ? String(item.suggested_disc_number) : '',
  }
}

export function trackKey(track: TrackChoice): number {
  return track.disc_number * 10000 + track.position
}

export type AlbumDropPayload = DragPayload | { type: 'album'; releaseId: number }

function parseDragPayload(e: DragEvent): AlbumDropPayload | null {
  try {
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return null
    return JSON.parse(raw) as AlbumDropPayload
  } catch {
    return null
  }
}

function FileChip({ item, onDiscard }: { item: TaggingItem; onDiscard: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'file', itemId: item.id }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex items-center justify-between gap-2 bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing"
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
      onDrop={(e) => {
        e.stopPropagation()
        onDrop(e)
      }}
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
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 flex flex-col gap-2">
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
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
        />
        <input
          value={edit.trackNumber}
          onChange={(e) => onEditChange({ ...edit, trackNumber: e.target.value })}
          placeholder="N°"
          type="number"
          className="w-16 bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
        />
        <input
          value={edit.discNumber}
          onChange={(e) => onEditChange({ ...edit, discNumber: e.target.value })}
          placeholder="Disque"
          type="number"
          className="w-20 bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
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

function ErrorRow({ item, onRescan, onDiscard, busy }: { item: TaggingItem; onRescan: () => void; onDiscard: () => void; busy: boolean }) {
  return (
    <div className="bg-neutral-950 border border-red-900/60 rounded-lg p-3 flex items-center justify-between gap-3">
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

export default function AlbumCard({
  release,
  items,
  tracklist,
  assignment,
  itemsById,
  busy,
  busyIds,
  edits,
  onAssign,
  onUnassign,
  onConfirmPair,
  onConfirmAlbum,
  onDiscard,
  onRescan,
  onEditChange,
  onConfirmManual,
  onDelete,
  onDrop,
}: {
  release: ReleaseCard
  items: TaggingItem[]
  tracklist: TrackChoice[] | null | undefined
  assignment: Record<number, number>
  itemsById: Map<number, TaggingItem>
  busy: boolean
  busyIds: Set<number>
  edits: Record<number, Edit>
  onAssign: (key: number, itemId: number) => void
  onUnassign: (key: number) => void
  onConfirmPair: (item: TaggingItem, track: TrackChoice, key: number) => void
  onConfirmAlbum: () => void
  onDiscard: (item: TaggingItem) => void
  onRescan: (item: TaggingItem) => void
  onEditChange: (itemId: number, edit: Edit) => void
  onConfirmManual: (item: TaggingItem) => void
  onDelete: () => void
  onDrop: (payload: AlbumDropPayload) => void
}) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [cardDragOver, setCardDragOver] = useState(false)

  const pending = items.filter((i) => i.status === 'needs_review')
  const errors = items.filter((i) => i.status === 'error')
  const assignedIds = new Set(Object.values(assignment))
  const unmatched = pending.filter((i) => !assignedIds.has(i.id))
  const assignedCount = Object.keys(assignment).length
  const year = release.release_date ? release.release_date.slice(0, 4) : null

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'album', releaseId: release.release_id }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setCardDragOver(true)
      }}
      onDragLeave={() => setCardDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setCardDragOver(false)
        const payload = parseDragPayload(e)
        if (payload) onDrop(payload)
      }}
      className={`mb-6 bg-neutral-900 border rounded-lg p-3 ${cardDragOver ? 'border-purple-500 bg-purple-950/10' : 'border-neutral-800'}`}
    >
      <div className="flex items-center gap-3 mb-3">
        {release.cover_url ? (
          <img src={release.cover_url} alt="" className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded bg-neutral-800 flex items-center justify-center text-lg shrink-0">🎧</div>
        )}
        <div className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
          <h2 className="font-medium text-neutral-200 truncate">
            {release.artist_name} - {release.release_title}
          </h2>
          <div className="text-xs text-neutral-500">
            {year && <span>{year} · </span>}
            {tracklist && tracklist.length > 0 ? (
              <span>{assignedCount}/{tracklist.length} pistes assignees</span>
            ) : (
              <span>{items.length} fichier{items.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tracklist && tracklist.length > 0 && assignedCount > 0 && (
            <button
              onClick={onConfirmAlbum}
              disabled={busy}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
            >
              {busy && <Spinner className="w-3 h-3" />}
              Confirmer l'album
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-neutral-500 hover:text-red-400 text-sm px-1"
            title="Retirer cet album (les fichiers redeviennent non identifies)"
          >
            ✕
          </button>
        </div>
      </div>

      {tracklist === undefined && <p className="text-xs text-neutral-500">Chargement de la tracklist...</p>}

      {tracklist && tracklist.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-neutral-500 mb-1">Sans correspondance ({unmatched.length})</div>
            {unmatched.map((item) => (
              <FileChip key={item.id} item={item} onDiscard={() => onDiscard(item)} />
            ))}
            {unmatched.length === 0 && <p className="text-xs text-neutral-600 italic">Tous les fichiers sont assignes.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-neutral-500 mb-1">Pistes ({tracklist.length})</div>
            {[...tracklist]
              .sort((a, b) => a.disc_number - b.disc_number || a.position - b.position)
              .map((track) => {
                const key = trackKey(track)
                const assignedItem = assignment[key] != null ? itemsById.get(assignment[key]) : undefined
                const dragKey = `${release.release_id}:${key}`
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
                      setDragOverKey(null)
                      const payload = parseDragPayload(e)
                      if (payload?.type === 'file') onAssign(key, payload.itemId)
                    }}
                    onUnassign={() => onUnassign(key)}
                    onConfirm={() => assignedItem && onConfirmPair(assignedItem, track, key)}
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
              onEditChange={(edit) => onEditChange(item.id, edit)}
              onConfirm={() => onConfirmManual(item)}
              onDiscard={() => onDiscard(item)}
              busy={busyIds.has(item.id)}
            />
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {errors.map((item) => (
            <ErrorRow key={item.id} item={item} onRescan={() => onRescan(item)} onDiscard={() => onDiscard(item)} busy={busyIds.has(item.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
