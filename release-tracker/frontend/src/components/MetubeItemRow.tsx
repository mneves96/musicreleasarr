import { useState } from 'react'
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
  pending: 'bg-app-surface-hover text-app-text-muted',
  scheduled: 'bg-app-surface-hover text-app-text-muted',
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

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="relative flex-1 h-2.5 rounded-full bg-app-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-app-accent to-app-accent-text transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        >
          <div className="w-full h-full opacity-40 animate-pulse bg-white/30" />
        </div>
      </div>
      <span className="text-xs font-medium text-app-text-muted tabular-nums w-9 text-right">{percent}%</span>
    </div>
  )
}

export default function MetubeItemRow({
  item,
  onDelete,
  onRetry,
  onStart,
}: {
  item: MetubeItem
  onDelete: () => Promise<void>
  onRetry?: () => Promise<void>
  onStart?: () => Promise<void>
}) {
  const [busyAction, setBusyAction] = useState<'delete' | 'retry' | 'start' | null>(null)
  const percent = item.percent != null ? Math.max(0, Math.min(100, Math.round(item.percent))) : null

  async function run(action: 'delete' | 'retry' | 'start', fn: () => Promise<void>) {
    setBusyAction(action)
    try {
      await fn()
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-app-surface border border-app-border">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate" title={item.url}>
          {item.title || item.url}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] ?? 'bg-app-surface-hover text-app-text-muted'}`}>
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
          {item.status === 'downloading' && percent != null && (
            <span className="text-[11px] text-app-text-muted">
              {item.speed != null && `${formatBytes(item.speed)}/s`}
              {item.eta != null && ` - reste ${formatEta(item.eta)}`}
            </span>
          )}
          {item.status === 'finished' && item.size != null && (
            <span className="text-[11px] text-app-text-muted">{formatBytes(item.size)}</span>
          )}
          {item.folder && <span className="text-[11px] text-app-text-faint">dossier: {item.folder}</span>}
        </div>
        {item.status === 'downloading' && percent != null && <ProgressBar percent={percent} />}
        {item.status === 'error' && (item.error || item.msg) && (
          <div className="text-[11px] text-red-400 mt-1 truncate" title={item.error || item.msg || ''}>
            {item.error || item.msg}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {item.status === 'pending' && onStart && (
          <button
            onClick={() => run('start', onStart)}
            disabled={busyAction !== null}
            className="text-xs px-2 py-1 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
          >
            {busyAction === 'start' ? '...' : 'Demarrer'}
          </button>
        )}
        {item.status === 'error' && onRetry && (
          <button
            onClick={() => run('retry', onRetry)}
            disabled={busyAction !== null}
            className="text-xs px-2 py-1 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
          >
            {busyAction === 'retry' ? '...' : 'Reessayer'}
          </button>
        )}
        <button
          onClick={() => run('delete', onDelete)}
          disabled={busyAction !== null}
          className="text-xs px-2 py-1 rounded-md bg-app-surface-hover hover:bg-red-900/50 disabled:opacity-50"
          title="Supprimer"
        >
          {busyAction === 'delete' ? '...' : '✕'}
        </button>
      </div>
    </div>
  )
}
