export default function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function LoadingBlock({ label = 'Chargement...' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-neutral-400 py-4">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function DownloadingIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={`animate-bounce text-purple-400 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Telechargement en cours"
    >
      <title>Telechargement en cours</title>
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  )
}
