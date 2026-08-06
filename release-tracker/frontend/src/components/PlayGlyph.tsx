export default function PlayGlyph({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 5v14l12-7z" />
    </svg>
  )
}
