import type { ReactNode } from 'react'

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
  const available = Boolean(href)

  const base = compact
    ? 'flex items-center justify-center w-6 h-6 rounded-md'
    : 'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border'

  if (!available) {
    return (
      <span
        className={`${base} ${compact ? '' : 'border-neutral-800'} text-neutral-600 opacity-40 cursor-not-allowed`}
        title={`${label} : lien non disponible`}
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
      className={`${base} ${compact ? 'hover:bg-neutral-800' : 'border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800'}`}
    >
      <span className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'}>{icon}</span>
      {!compact && label}
    </a>
  )
}
