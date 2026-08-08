import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { usePlayer } from './PlayerContext'

interface ToastEntry {
  id: number
  message: string
}

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 3000

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast doit etre utilise a l'interieur de <ToastProvider>")
  return ctx
}

// Notifications ephemeres en bas a droite (ex: "Telechargement envoye a
// MeTube") - remplace les statuts persistants (pastilles) qui trainaient
// indefiniment sur chaque element telechargeable. Decale au-dessus du
// PlayerBar quand une file de lecture est active, sinon il le recouvrirait.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)
  const { queue } = usePlayer()

  const showToast = useCallback((message: string) => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className={`fixed right-4 z-50 flex flex-col gap-2 pointer-events-none transition-[bottom] ${
          queue.length > 0 ? 'bottom-24' : 'bottom-4'
        }`}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-app-surface border border-app-border-strong text-app-text text-sm rounded-lg shadow-lg px-4 py-2.5 animate-toast-in"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
