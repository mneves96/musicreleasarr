import { useMemo, useState } from 'react'
import type { TaggingItem } from '../api'

interface FolderNode {
  name: string
  path: string
  folders: Map<string, FolderNode>
  files: TaggingItem[]
}

function buildTree(items: TaggingItem[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: new Map(), files: [] }
  for (const item of items) {
    const segments = item.relative_path.split('/').filter(Boolean)
    segments.pop() // dernier segment = nom de fichier, deja dans item.original_filename
    let node = root
    let pathSoFar = ''
    for (const seg of segments) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg
      let child = node.folders.get(seg)
      if (!child) {
        child = { name: seg, path: pathSoFar, folders: new Map(), files: [] }
        node.folders.set(seg, child)
      }
      node = child
    }
    node.files.push(item)
  }
  return root
}

function collectIds(node: FolderNode): number[] {
  const ids = node.files.map((f) => f.id)
  for (const child of node.folders.values()) ids.push(...collectIds(child))
  return ids
}

export type DragPayload = { type: 'file'; itemId: number } | { type: 'folder'; itemIds: number[] }

interface FileTreeProps {
  items: TaggingItem[]
  selectedIds: Set<number>
  onToggleSelect: (ids: number[], selected: boolean) => void
  onDiscard: (itemId: number) => void
}

// Arborescence reelle du dossier de telechargements (pas 1 ligne par artiste) -
// dossiers repliables avec case a cocher tri-state, fichiers avec case a
// cocher individuelle. Fichiers et dossiers sont tous deux glissables vers la
// colonne de droite (voir BacklogPage.tsx pour la gestion du drop).
export default function FileTree({ items, selectedIds, onToggleSelect, onDiscard }: FileTreeProps) {
  const tree = useMemo(() => buildTree(items), [items])
  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  // Deplie les dossiers de premier niveau par defaut, une seule fois (pas a
  // chaque changement de `items`, sinon un dossier replie manuellement par
  // l'utilisateur se rouvrirait tout seul apres un rafraichissement).
  const effectiveExpanded = expanded ?? new Set(tree.folders.keys())

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev ?? tree.folders.keys())
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (items.length === 0) {
    return <p className="text-sm text-app-text-faint">Aucun fichier en attente.</p>
  }

  return (
    <div className="flex flex-col">
      {[...tree.folders.values()].map((folder) => (
        <FolderRow
          key={folder.path}
          node={folder}
          depth={0}
          expanded={effectiveExpanded}
          onToggleExpand={toggleExpand}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onDiscard={onDiscard}
        />
      ))}
      {tree.files.map((file) => (
        <FileRow key={file.id} item={file} depth={0} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onDiscard={onDiscard} />
      ))}
    </div>
  )
}

function FolderRow({
  node,
  depth,
  expanded,
  onToggleExpand,
  selectedIds,
  onToggleSelect,
  onDiscard,
}: {
  node: FolderNode
  depth: number
  expanded: Set<string>
  onToggleExpand: (path: string) => void
  selectedIds: Set<number>
  onToggleSelect: (ids: number[], selected: boolean) => void
  onDiscard: (itemId: number) => void
}) {
  const isOpen = expanded.has(node.path)
  const descendantIds = useMemo(() => collectIds(node), [node])
  const selectedCount = descendantIds.filter((id) => selectedIds.has(id)).length
  const allSelected = descendantIds.length > 0 && selectedCount === descendantIds.length
  const someSelected = selectedCount > 0 && !allSelected

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'folder', itemIds: descendantIds }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-app-surface cursor-grab active:cursor-grabbing"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        <button
          onClick={() => onToggleExpand(node.path)}
          className="text-app-text-faint w-4 shrink-0 text-xs"
          title={isOpen ? 'Replier' : 'Deplier'}
        >
          {isOpen ? '▾' : '▸'}
        </button>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected
          }}
          onChange={(e) => onToggleSelect(descendantIds, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="truncate flex-1 text-sm text-app-text">{node.name}</span>
        <span className="text-xs text-app-text-faint shrink-0">{descendantIds.length}</span>
      </div>
      {isOpen && (
        <div>
          {[...node.folders.values()].map((child) => (
            <FolderRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onDiscard={onDiscard}
            />
          ))}
          {node.files.map((file) => (
            <FileRow
              key={file.id}
              item={file}
              depth={depth + 1}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onDiscard={onDiscard}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow({
  item,
  depth,
  selectedIds,
  onToggleSelect,
  onDiscard,
}: {
  item: TaggingItem
  depth: number
  selectedIds: Set<number>
  onToggleSelect: (ids: number[], selected: boolean) => void
  onDiscard: (itemId: number) => void
}) {
  const checked = selectedIds.has(item.id)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'file', itemId: item.id }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="flex items-center gap-2 py-1 px-1 rounded hover:bg-app-surface cursor-grab active:cursor-grabbing text-sm"
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
      title={item.original_filename}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onToggleSelect([item.id], e.target.checked)} />
      <span className="truncate flex-1 text-app-text-muted">{item.original_filename}</span>
      {item.status === 'error' && (
        <span className="text-[10px] text-red-400 shrink-0" title={item.error_message ?? undefined}>
          ⚠
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDiscard(item.id)
        }}
        className="text-app-text-faint hover:text-red-400 text-xs px-1 shrink-0"
        title="Ignorer ce fichier"
      >
        ✕
      </button>
    </div>
  )
}
