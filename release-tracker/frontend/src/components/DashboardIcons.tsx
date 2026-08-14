type IconProps = { className?: string }

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function AlbumIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

export function TrackIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  )
}

export function GenreIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 4h8l8 8-8 8-8-8V4z" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ClockIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

export function CheckCircleIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

export function ErrorCircleIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  )
}

export function ScrobbleIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 3v18" />
      <path d="M7 7v10" />
      <path d="M17 7v10" />
      <path d="M3 10v4" />
      <path d="M21 10v4" />
    </svg>
  )
}
