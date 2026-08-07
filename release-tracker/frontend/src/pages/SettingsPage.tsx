import { useEffect, useState, type ReactNode } from 'react'
import { api, type Settings, type TestConnectionResult } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'
import { ACCENT_COLORS, useTheme, type AccentColor } from '../context/ThemeContext'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-4">
      <h2 className="font-medium mb-3">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-app-text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-app-bg border border-app-border-strong rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-app-accent"
      />
    </label>
  )
}

function ResultLine({ result }: { result: TestConnectionResult | null }) {
  if (!result) return null
  return <p className={`text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>{result.message}</p>
}

function LastfmSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings({ ...settings, [key]: value })
  }

  async function startConnect() {
    setBusy(true)
    setError(null)
    try {
      const { token, auth_url } = await api.lastfmAuthStart()
      setPendingToken(token)
      window.open(auth_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function finishConnect() {
    if (!pendingToken) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api.lastfmAuthFinish(pendingToken)
      setSettings(updated)
      setPendingToken(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.lastfmDisconnect()
      setSettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Last.fm">
      <Field
        label="Cle API (la meme que celle de Navidrome fonctionne)"
        value={settings.lastfm_api_key ?? ''}
        onChange={(v) => set('lastfm_api_key', v)}
      />
      <Field
        label="Secret partage (necessaire uniquement pour se connecter et recevoir des recommandations personnalisees)"
        type="password"
        value={settings.lastfm_api_secret ?? ''}
        onChange={(v) => set('lastfm_api_secret', v)}
      />
      <p className="text-xs text-app-text-faint">
        Cle API et secret se recuperent sur{' '}
        <a
          href="https://www.last.fm/api/account/create"
          target="_blank"
          rel="noreferrer"
          className="text-app-accent-text hover:underline"
        >
          last.fm/api/account/create
        </a>{' '}
        - pense a enregistrer la page Reglages (bouton en bas) avant de te connecter.
      </p>

      {settings.lastfm_username ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-400">Connecte en tant que {settings.lastfm_username}</span>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-red-900/50 disabled:opacity-50"
            >
              Deconnecter
            </button>
          </div>
          <Field
            label="Planification du rafraichissement des recommandations (ex: 0 3 * * * = tous les jours a 3h)"
            value={settings.lastfm_recommendations_cron}
            onChange={(v) => set('lastfm_recommendations_cron', v)}
          />
          <p className="text-xs text-app-text-faint">
            Chaque nuit, les anciennes recommandations non suivies sont supprimees et remplacees par les
            nouvelles - un bouton "Rafraichir" dans l'onglet Recommandations declenche le meme rafraichissement
            a la demande.
          </p>
        </div>
      ) : pendingToken ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-app-text-muted">
            Une page Last.fm vient de s'ouvrir dans un nouvel onglet : autorise l'acces, puis reviens ici et valide.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={finishConnect}
              disabled={busy}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
            >
              {busy && <Spinner className="w-3 h-3" />}
              J'ai autorise l'acces, valider
            </button>
            <button onClick={() => setPendingToken(null)} className="text-xs text-app-text-faint hover:text-app-text">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={startConnect}
            disabled={busy || !settings.lastfm_api_key || !settings.lastfm_api_secret}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
          >
            {busy && <Spinner className="w-3 h-3" />}
            Connecter Last.fm
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </Section>
  )
}

function CalendarSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const url = settings.calendar_token ? `${window.location.origin}/api/calendar/${settings.calendar_token}.ics` : null

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      setSettings(await api.regenerateCalendarToken())
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <Section title="Calendrier">
      <p className="text-sm text-app-text-muted">
        Abonne-toi a ce lien depuis Google Calendar, Apple Calendar ou Outlook pour voir les sorties directement
        dans ton calendrier - il se met a jour automatiquement, comme la page Calendrier de l'app.
      </p>
      {url && (
        <div className="flex items-center gap-2">
          <input readOnly value={url} className="flex-1 bg-app-bg border border-app-border-strong rounded-md px-3 py-1.5 text-sm text-app-text-muted" />
          <button onClick={copy} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong whitespace-nowrap">
            {copied ? 'Copie !' : 'Copier'}
          </button>
        </div>
      )}
      <div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
        >
          {regenerating && <Spinner className="w-3 h-3" />}
          Regenerer le lien
        </button>
        <p className="text-xs text-app-text-faint mt-1">L'ancien lien cessera de fonctionner immediatement.</p>
      </div>
    </Section>
  )
}

const ACCENT_LABELS: Record<AccentColor, string> = {
  violet: 'Violet',
  blue: 'Bleu',
  sky: 'Ciel',
  emerald: 'Emeraude',
  amber: 'Ambre',
  rose: 'Rose',
  pink: 'Rose vif',
  indigo: 'Indigo',
}

const ACCENT_SWATCH_CLASS: Record<AccentColor, string> = {
  violet: 'bg-violet-600',
  blue: 'bg-blue-600',
  sky: 'bg-sky-600',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
  pink: 'bg-pink-600',
  indigo: 'bg-indigo-600',
}

function AppearanceSection() {
  const { theme, accent, setTheme, setAccent } = useTheme()

  return (
    <Section title="Apparence">
      <div>
        <span className="text-sm text-app-text-muted block mb-2">Theme</span>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className={`px-3 py-1.5 rounded-md text-sm border ${
                theme === mode
                  ? 'border-app-accent bg-app-accent-soft text-app-text'
                  : 'border-app-border-strong text-app-text-muted hover:bg-app-surface-hover'
              }`}
            >
              {mode === 'dark' ? 'Sombre' : 'Clair'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-sm text-app-text-muted block mb-2">Couleur d'accent</span>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setAccent(color)}
              title={ACCENT_LABELS[color]}
              aria-label={ACCENT_LABELS[color]}
              className={`w-8 h-8 rounded-full ${ACCENT_SWATCH_CLASS[color]} ${
                accent === color ? 'ring-2 ring-offset-2 ring-offset-app-bg ring-app-text' : ''
              }`}
            />
          ))}
        </div>
      </div>
    </Section>
  )
}

function SecuritySection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestConnectionResult | null>(null)

  async function submit() {
    setResult(null)
    if (next !== confirm) {
      setResult({ ok: false, message: 'Les deux mots de passe ne correspondent pas' })
      return
    }
    if (next.length < 8) {
      setResult({ ok: false, message: 'Nouveau mot de passe trop court (8 caracteres minimum)' })
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setResult({ ok: true, message: 'Mot de passe mis a jour' })
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Erreur' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Securite">
      <Field label="Mot de passe actuel" type="password" value={current} onChange={setCurrent} />
      <Field label="Nouveau mot de passe" type="password" value={next} onChange={setNext} />
      <Field label="Confirmer le nouveau mot de passe" type="password" value={confirm} onChange={setConfirm} />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !current || !next}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
        >
          {busy && <Spinner className="w-3 h-3" />}
          Changer le mot de passe
        </button>
        <ResultLine result={result} />
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [results, setResults] = useState<Record<string, TestConnectionResult>>({})

  useEffect(() => {
    api.getSettings().then(setSettings).catch((err) => setLoadError(err instanceof Error ? err.message : 'Erreur'))
  }, [])

  if (loadError) return <p className="text-sm text-red-400">Impossible de charger les reglages : {loadError}</p>
  if (!settings) return <LoadingBlock />

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      const updated = await api.updateSettings(settings)
      setSettings(updated)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  async function runTest(key: string, fn: () => Promise<TestConnectionResult>) {
    const result = await fn()
    setResults((r) => ({ ...r, [key]: result }))
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Reglages</h1>

      <AppearanceSection />

      <Section title="MeTube">
        <Field label="URL de MeTube (ex: http://metube:8081)" value={settings.metube_url ?? ''} onChange={(v) => set('metube_url', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('metube', api.testMetube)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            Tester la connexion
          </button>
          <ResultLine result={results.metube ?? null} />
        </div>
        <Field
          label="URL publique de MeTube (optionnel, accessible depuis ton navigateur - permet d'ouvrir l'interface MeTube complete pour les fonctionnalites avancees non reprises ici, ex: http://192.168.1.128:8081)"
          value={settings.metube_public_url ?? ''}
          onChange={(v) => set('metube_public_url', v)}
        />
      </Section>

      <Section title="Navidrome (verification de possession)">
        <Field label="URL de Navidrome" value={settings.navidrome_url ?? ''} onChange={(v) => set('navidrome_url', v)} />
        <Field label="Utilisateur" value={settings.navidrome_username ?? ''} onChange={(v) => set('navidrome_username', v)} />
        <Field label="Mot de passe" type="password" value={settings.navidrome_password ?? ''} onChange={(v) => set('navidrome_password', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('navidrome', api.testNavidrome)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            Tester la connexion
          </button>
          <ResultLine result={results.navidrome ?? null} />
        </div>
      </Section>

      <LastfmSection settings={settings} setSettings={setSettings} />

      <Section title="Notifications par email">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.notify_email_enabled} onChange={(e) => set('notify_email_enabled', e.target.checked)} />
          Activer les notifications par email
        </label>
        <Field label="Serveur SMTP" value={settings.smtp_host ?? ''} onChange={(v) => set('smtp_host', v)} />
        <Field label="Port SMTP" type="number" value={settings.smtp_port?.toString() ?? ''} onChange={(v) => set('smtp_port', v ? Number(v) : null)} />
        <Field label="Utilisateur SMTP" value={settings.smtp_user ?? ''} onChange={(v) => set('smtp_user', v)} />
        <Field label="Mot de passe SMTP" type="password" value={settings.smtp_password ?? ''} onChange={(v) => set('smtp_password', v)} />
        <Field label="Adresse expediteur" value={settings.smtp_from ?? ''} onChange={(v) => set('smtp_from', v)} />
        <Field label="Adresse destinataire" value={settings.smtp_to ?? ''} onChange={(v) => set('smtp_to', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('email', api.testEmail)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            Envoyer un email de test
          </button>
          <ResultLine result={results.email ?? null} />
        </div>
      </Section>

      <Section title="Notifications Pushbullet">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notify_pushbullet_enabled}
            onChange={(e) => set('notify_pushbullet_enabled', e.target.checked)}
          />
          Activer les notifications Pushbullet
        </label>
        <Field label="Token d'acces Pushbullet" value={settings.pushbullet_token ?? ''} onChange={(v) => set('pushbullet_token', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('pushbullet', api.testPushbullet)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            Envoyer une notification de test
          </button>
          <ResultLine result={results.pushbullet ?? null} />
        </div>
      </Section>

      <Section title="Organisation automatique">
        <p className="text-sm text-app-text-muted">
          Chemins vus depuis le conteneur "releases" (le meme volume musical doit y etre monte en ecriture).
          Utilises par le backlog de redressage metadata pour detecter les telechargements MeTube et ranger les
          fichiers confirmes.
        </p>
        <Field
          label="Dossier des telechargements MeTube (ex: /music/youtube)"
          value={settings.tagging_downloads_path}
          onChange={(v) => set('tagging_downloads_path', v)}
        />
        <Field
          label="Dossier racine de la bibliotheque rangee (ex: /music)"
          value={settings.tagging_library_path}
          onChange={(v) => set('tagging_library_path', v)}
        />
      </Section>

      <Section title="Planification du scan">
        <Field label="Expression cron (ex: 0 6 * * * = tous les jours a 6h)" value={settings.scan_cron} onChange={(v) => set('scan_cron', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('scan', api.runScanNow)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            Lancer un scan maintenant
          </button>
          <ResultLine result={results.scan ?? null} />
        </div>
      </Section>

      <CalendarSection settings={settings} setSettings={setSettings} />

      <SecuritySection />

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {savedAt && <span className="text-sm text-green-400">Enregistre</span>}
      </div>
    </div>
  )
}
