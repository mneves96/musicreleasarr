import type { DownloadStatus, OwnershipStatus, TaggingStatus } from '../api'

const OWNERSHIP_STYLES: Record<OwnershipStatus, string> = {
  owned: 'bg-green-900/50 text-green-300 border-green-700',
  missing: 'bg-amber-900/50 text-amber-300 border-amber-700',
  unknown: 'bg-neutral-800 text-neutral-400 border-neutral-700',
}

const OWNERSHIP_LABELS: Record<OwnershipStatus, string> = {
  owned: 'Possedee',
  missing: 'Manquante',
  unknown: 'Statut inconnu',
}

const DOWNLOAD_STYLES: Record<DownloadStatus, string> = {
  not_requested: '',
  queued: 'bg-blue-900/50 text-blue-300 border-blue-700',
  downloaded: 'bg-green-900/50 text-green-300 border-green-700',
  failed: 'bg-red-900/50 text-red-300 border-red-700',
}

const DOWNLOAD_LABELS: Record<DownloadStatus, string> = {
  not_requested: '',
  queued: 'Telechargement en cours',
  downloaded: 'Telecharge',
  failed: 'Echec du telechargement',
}

function Badge({
  className,
  children,
  title,
}: {
  className: string
  children: string
  title?: string
}) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${className}`} title={title}>
      {children}
    </span>
  )
}

export function OwnershipBadge({ status }: { status: OwnershipStatus }) {
  return <Badge className={OWNERSHIP_STYLES[status]}>{OWNERSHIP_LABELS[status]}</Badge>
}

export function DownloadBadge({
  status,
  progress,
  error,
}: {
  status: DownloadStatus
  progress?: number | null
  error?: string | null
}) {
  if (status === 'not_requested') return null

  let label: string = DOWNLOAD_LABELS[status]
  if (status === 'queued' && typeof progress === 'number') {
    label = `Telechargement en cours (${progress}%)`
  }

  return (
    <Badge className={DOWNLOAD_STYLES[status]} title={status === 'failed' ? error ?? undefined : undefined}>
      {label}
    </Badge>
  )
}

const TAGGING_STYLES: Record<TaggingStatus, string> = {
  needs_review: 'bg-amber-900/50 text-amber-300 border-amber-700',
  done: 'bg-green-900/50 text-green-300 border-green-700',
  error: 'bg-red-900/50 text-red-300 border-red-700',
}

const TAGGING_LABELS: Record<TaggingStatus, string> = {
  needs_review: 'A verifier',
  done: 'Range',
  error: 'Erreur',
}

export function TaggingBadge({ status, error }: { status: TaggingStatus; error?: string | null }) {
  return (
    <Badge className={TAGGING_STYLES[status]} title={status === 'error' ? error ?? undefined : undefined}>
      {TAGGING_LABELS[status]}
    </Badge>
  )
}
