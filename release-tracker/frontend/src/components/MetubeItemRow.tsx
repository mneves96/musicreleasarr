import type { MetubeItem } from '../api'

function formatBytes(n: number | null): string {
  if (n == null) return ''
  if (n < 1024) return `${n} o`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`
  return `${(n / 1024 ** 3).toFixed(2)} Go`
}

function formatEta(s: number | null): string {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-neutral-800 text-neutral-400',
  scheduled: 'bg-neutral-800 text-neutral-400',
  preparing: 'bg-blue-900/50 text-blue-300',
  downloading: 'bg-blue-900/50 text-blue-300',
  finished: 'bg-green-900/50 text-green-300',
  error: 'bg-red-900/50 text-red-300',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  scheduled: 'Programme',
  preparing: 'Preparation...',
  downloading: 'Telechargement',
  finished: 'Termine',
  error: 'Erreur',
}

export default function MetubeItemRow({
  item,
  onDelete,
  onRetry,
  onStart,
}: {
  item: MetubeItem
  onDelete: () => void
  onRetry?: () => void
  onStart?: () => void
}) {
  const percent = item.percent != null ? Math.max(0, Math.min(100, Math.round(item.percent))) : null

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" title={item.url}>
          {item.title || item.url}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? 'bg-neutral-800 text-neutral-400'}`}>
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
          {item.status === 'downloading' && percent != null && (
            <span className="text-[11px] text-neutral-400">
              {percent}%{item.speed != null && ` - ${formatBytes(item.speed)}/s`}
              {item.eta != null && ` - ${formatEta(item.eta)}`}
            </span>
          )}
          {item.status === 'finished' && item.size != null && (
            <span className="text-[11px] text-neutral-400">{formatBytes(item.size)}</span>
          )}
          {item.folder && <span className="text-[11px] text-neutral-500">dossier: {item.folder}</span>}
        </div>
        {item.status === 'downloading' && percent != null && (
          <div className="mt-1.5 h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full bg-purple-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        )}
        {item.status === 'error' && (item.error || item.msg) && (
          <div className="text-[11px] text-red-400 mt-1 truncate" title={item.error || item.msg || ''}>
            {item.error || item.msg}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {item.status === 'pending' && onStart && (
          <button onClick={onStart} className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Demarrer
          </button>
        )}
        {item.status === 'error' && onRetry && (
          <button onClick={onRetry} className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Reessayer
          </button>
        )}
        <button onClick={onDelete} className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-red-900/50" title="Supprimer">
          ✕
        </button>
      </div>
    </div>
  )
}
