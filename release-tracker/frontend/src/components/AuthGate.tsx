import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, type AuthStatus } from '../api'
import LoginPage from '../pages/LoginPage'
import SetupPage from '../pages/SetupPage'
import { LoadingBlock } from './Spinner'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)

  const refresh = useCallback(() => {
    api.authStatus().then(setStatus).catch(() => setStatus({ needs_setup: false, authenticated: false, username: null }))
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('auth:unauthorized', refresh)
    return () => window.removeEventListener('auth:unauthorized', refresh)
  }, [refresh])

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingBlock />
      </div>
    )
  }

  if (status.needs_setup) return <SetupPage onDone={refresh} />
  if (!status.authenticated) return <LoginPage onDone={refresh} />

  return <>{children}</>
}
