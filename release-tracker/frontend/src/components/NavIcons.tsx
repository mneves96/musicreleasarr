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

export function DashboardIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export function ArtistsIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  )
}

export function CalendarIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  )
}

export function BacklogIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  )
}

export function NavidromeNavIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SettingsIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 6h10" />
      <circle cx="17" cy="6" r="2" />
      <path d="M20 12H10" />
      <circle cx="7" cy="12" r="2" />
      <path d="M4 18h10" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}

export function LogoutIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}
