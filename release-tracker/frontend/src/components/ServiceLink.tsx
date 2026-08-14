import type { ReactNode } from 'react'
import { useLanguage } from '../context/LanguageContext'

export default function ServiceLink({
  href,
  label,
  icon,
  compact = false,
}: {
  href: string | null | undefined
  label: string
  icon: ReactNode
  compact?: boolean
}) {
  const { t } = useLanguage()
  const available = Boolean(href)

  const base = compact
    ? 'flex items-center justify-center w-6 h-6 rounded-md'
    : 'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border'

  if (!available) {
    return (
      <span
        className={`${base} ${compact ? '' : 'border-app-border'} text-app-text-faint opacity-40 cursor-not-allowed`}
        title={t('serviceLink.linkUnavailable', { label })}
      >
        <span className={`${compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} grayscale`}>{icon}</span>
        {!compact && label}
      </span>
    )
  }

  return (
    <a
      href={href ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={label}
      className={`${base} ${compact ? 'hover:bg-app-surface-hover' : 'border-app-border-strong text-app-text hover:border-app-text-faint hover:bg-app-surface-hover'}`}
    >
      <span className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'}>{icon}</span>
      {!compact && label}
    </a>
  )
}
