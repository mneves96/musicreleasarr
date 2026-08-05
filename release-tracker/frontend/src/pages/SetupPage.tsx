import { type FormEvent, useState } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'

export default function SetupPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas')
      return
    }
    if (password.length < 8) {
      setError('Mot de passe trop court (8 caracteres minimum)')
      return
    }
    setBusy(true)
    try {
      await api.authSetup(username, password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la creation du compte')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 justify-center mb-2">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <h1 className="text-lg font-semibold">MusicReleasarr</h1>
        </div>
        <p className="text-sm text-neutral-400 text-center">
          Premiere connexion - cree le compte qui protegera l'acces a l'app.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Nom d'utilisateur</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Confirmer le mot de passe</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50"
        >
          {busy && <Spinner />}
          Creer le compte
        </button>
      </form>
    </div>
  )
}
