import { type FormEvent, useState } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'

export default function LoginPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.authLogin(username, password)
      onDone()
    } catch {
      setError('Identifiants incorrects')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-app-surface border border-app-border rounded-lg p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 justify-center mb-2">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <h1 className="text-lg font-semibold">MusicReleasarr</h1>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-text-muted">Nom d'utilisateur</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-app-bg border border-app-border-strong rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-app-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-text-muted">Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-app-bg border border-app-border-strong rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-app-accent"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
        >
          {busy && <Spinner />}
          Se connecter
        </button>
        <p className="text-xs text-app-text-faint text-center">
          Mot de passe perdu ? Voir la commande <code>reset-password</code> dans le README.
        </p>
      </form>
    </div>
  )
}
