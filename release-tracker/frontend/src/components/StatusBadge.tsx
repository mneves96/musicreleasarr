import type { OwnershipStatus, TaggingStatus } from '../api'
import { useLanguage } from '../context/LanguageContext'
import type { TranslationKey } from '../i18n/en'

const OWNERSHIP_STYLES: Record<OwnershipStatus, string> = {
  owned: 'bg-green-900/50 text-green-300 border-green-700',
  missing: 'bg-amber-900/50 text-amber-300 border-amber-700',
  unknown: 'bg-app-surface-hover text-app-text-muted border-app-border-strong',
}

const OWNERSHIP_LABEL_KEYS: Record<OwnershipStatus, TranslationKey> = {
  owned: 'release.owned',
  missing: 'release.missing',
  unknown: 'status.unknown',
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
  const { t } = useLanguage()
  return <Badge className={OWNERSHIP_STYLES[status]}>{t(OWNERSHIP_LABEL_KEYS[status])}</Badge>
}

const TAGGING_STYLES: Record<TaggingStatus, string> = {
  needs_review: 'bg-amber-900/50 text-amber-300 border-amber-700',
  done: 'bg-green-900/50 text-green-300 border-green-700',
  error: 'bg-red-900/50 text-red-300 border-red-700',
}

const TAGGING_LABEL_KEYS: Record<TaggingStatus, TranslationKey> = {
  needs_review: 'status.needsReview',
  done: 'status.filed',
  error: 'common.error',
}

export function TaggingBadge({ status, error }: { status: TaggingStatus; error?: string | null }) {
  const { t } = useLanguage()
  return (
    <Badge className={TAGGING_STYLES[status]} title={status === 'error' ? error ?? undefined : undefined}>
      {t(TAGGING_LABEL_KEYS[status])}
    </Badge>
  )
}
