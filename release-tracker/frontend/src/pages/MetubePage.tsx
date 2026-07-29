import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export default function MetubePage() {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    api.getSettings().then((s) => setUrl(s.metube_public_url))
  }, [])

  if (url === undefined) return <p className="text-neutral-400">Chargement...</p>

  if (!url) {
    return (
      <div className="text-neutral-400">
        <p>URL publique de MeTube non configuree.</p>
        <p className="mt-2">
          Renseigne-la dans{' '}
          <Link to="/settings" className="text-purple-400 hover:underline">
            Reglages
          </Link>{' '}
          (section MeTube) pour afficher l'interface ici.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-semibold">MeTube</h1>
        <div className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Ouvrir dans un nouvel onglet
          </a>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700"
          >
            ↻ Rafraichir
          </button>
        </div>
      </div>
      <iframe
        key={reloadKey}
        src={url}
        title="MeTube"
        className="flex-1 w-full rounded-lg border border-neutral-800 bg-neutral-900"
      />
    </div>
  )
}
