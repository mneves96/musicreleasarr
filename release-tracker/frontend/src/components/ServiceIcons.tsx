type IconProps = { className?: string }

export function MusicBrainzIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#BA478F" />
      <path d="M6.5 15.5c1.6-4.3 2.8-7.5 5.5-7.5s3.9 3.2 5.5 7.5" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="8.3" r="1.3" fill="#fff" />
    </svg>
  )
}

export function DeezerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#A238FF" />
      <g fill="#fff">
        <rect x="3.5" y="14" width="3" height="4.5" />
        <rect x="8" y="10.5" width="3" height="8" />
        <rect x="12.5" y="7.5" width="3" height="11" />
        <rect x="17" y="4.5" width="3" height="14" />
      </g>
    </svg>
  )
}

export function YoutubeMusicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#FF0000" />
      <circle cx="12" cy="12" r="6.3" fill="#fff" />
      <circle cx="12" cy="12" r="1.4" fill="#FF0000" />
      <path d="M10.3 9.4v5.2l4.5-2.6z" fill="#FF0000" />
    </svg>
  )
}

export function LastfmIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#D51007" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
        lf
      </text>
    </svg>
  )
}
