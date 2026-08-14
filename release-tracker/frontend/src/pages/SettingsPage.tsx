import { useEffect, useState, type ReactNode } from 'react'
import { api, type Settings, type TestConnectionResult } from '../api'
import Spinner, { LoadingBlock } from '../components/Spinner'
import { ACCENT_COLORS, useTheme, type AccentColor } from '../context/ThemeContext'
import { useLanguage, type Language } from '../context/LanguageContext'
import type { TranslationKey } from '../i18n/en'

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
  const { t } = useLanguage()
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
      setError(err instanceof Error ? err.message : t('common.error'))
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
      setError(err instanceof Error ? err.message : t('common.error'))
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
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Last.fm">
      <Field
        label={t('settings.lastfm.apiKeyLabel')}
        value={settings.lastfm_api_key ?? ''}
        onChange={(v) => set('lastfm_api_key', v)}
      />
      <Field
        label={t('settings.lastfm.secretLabel')}
        type="password"
        value={settings.lastfm_api_secret ?? ''}
        onChange={(v) => set('lastfm_api_secret', v)}
      />
      <p className="text-xs text-app-text-faint">
        {t('settings.lastfm.getKeysPrefix')}{' '}
        <a
          href="https://www.last.fm/api/account/create"
          target="_blank"
          rel="noreferrer"
          className="text-app-accent-text hover:underline"
        >
          last.fm/api/account/create
        </a>{' '}
        {t('settings.lastfm.getKeysSuffix')}
      </p>

      {settings.lastfm_username ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-400">{t('settings.connectedAs', { username: settings.lastfm_username })}</span>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-red-900/50 disabled:opacity-50"
            >
              {t('settings.disconnect')}
            </button>
          </div>
          <Field
            label={t('settings.recommendationsCronLabel')}
            value={settings.lastfm_recommendations_cron}
            onChange={(v) => set('lastfm_recommendations_cron', v)}
          />
          <p className="text-xs text-app-text-faint">{t('settings.lastfm.nightlyRefreshHint')}</p>
        </div>
      ) : pendingToken ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-app-text-muted">{t('settings.lastfm.authOpenedHint')}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={finishConnect}
              disabled={busy}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
            >
              {busy && <Spinner className="w-3 h-3" />}
              {t('settings.lastfm.confirmAuth')}
            </button>
            <button onClick={() => setPendingToken(null)} className="text-xs text-app-text-faint hover:text-app-text">
              {t('common.cancel')}
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
            {t('settings.lastfm.connect')}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </Section>
  )
}

// Pendant de LastfmSection ci-dessus pour les recommandations ListenBrainz
// (voir pages/RecommendedArtistsListenbrainzPage.tsx) : basees sur l'ecoute
// reelle (scrobbles) plutot que sur les artistes suivis dans l'app - Navidrome
// doit deja scrobbler vers ce compte pour qu'il y ait des donnees a exploiter.
// Pas de cle API/OAuth a gerer ici : juste le nom d'utilisateur, les
// stats/recommandations d'un profil ListenBrainz sont publiques par defaut.
function ListenbrainzSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const { t } = useLanguage()

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings({ ...settings, [key]: value })
  }

  return (
    <Section title="ListenBrainz">
      <p className="text-xs text-app-text-faint">{t('settings.listenbrainz.description')}</p>
      <Field
        label={t('settings.listenbrainz.usernameLabel')}
        value={settings.listenbrainz_username ?? ''}
        onChange={(v) => set('listenbrainz_username', v)}
      />
      <Field
        label={t('settings.recommendationsCronLabel')}
        value={settings.listenbrainz_recommendations_cron}
        onChange={(v) => set('listenbrainz_recommendations_cron', v)}
      />
      <p className="text-xs text-app-text-faint">{t('settings.listenbrainz.nightlyRefreshHint')}</p>
    </Section>
  )
}

function CalendarSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const { t } = useLanguage()
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
    <Section title={t('settings.calendar.title')}>
      <p className="text-sm text-app-text-muted">{t('settings.calendar.description')}</p>
      {url && (
        <div className="flex items-center gap-2">
          <input readOnly value={url} className="flex-1 bg-app-bg border border-app-border-strong rounded-md px-3 py-1.5 text-sm text-app-text-muted" />
          <button onClick={copy} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong whitespace-nowrap">
            {copied ? t('settings.calendar.copied') : t('settings.calendar.copy')}
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
          {t('settings.calendar.regenerate')}
        </button>
        <p className="text-xs text-app-text-faint mt-1">{t('settings.calendar.regenerateHint')}</p>
      </div>
    </Section>
  )
}

const ACCENT_LABEL_KEYS: Record<AccentColor, TranslationKey> = {
  violet: 'settings.accent.violet',
  blue: 'settings.accent.blue',
  sky: 'settings.accent.sky',
  emerald: 'settings.accent.emerald',
  amber: 'settings.accent.amber',
  rose: 'settings.accent.rose',
  pink: 'settings.accent.pink',
  indigo: 'settings.accent.indigo',
} as const

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
  const { language, setLanguage, t } = useLanguage()

  return (
    <Section title={t('settings.appearance.title')}>
      <div>
        <span className="text-sm text-app-text-muted block mb-2">{t('settings.language.label')}</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="bg-app-surface border border-app-border-strong rounded-md px-2 py-1.5 text-sm"
        >
          <option value="en">{t('settings.language.english')}</option>
          <option value="fr">{t('settings.language.french')}</option>
        </select>
      </div>
      <div>
        <span className="text-sm text-app-text-muted block mb-2">{t('settings.appearance.theme')}</span>
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
              {mode === 'dark' ? t('settings.appearance.dark') : t('settings.appearance.light')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-sm text-app-text-muted block mb-2">{t('settings.appearance.accentColor')}</span>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setAccent(color)}
              title={t(ACCENT_LABEL_KEYS[color])}
              aria-label={t(ACCENT_LABEL_KEYS[color])}
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
  const { t } = useLanguage()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestConnectionResult | null>(null)

  async function submit() {
    setResult(null)
    if (next !== confirm) {
      setResult({ ok: false, message: t('settings.security.passwordMismatch') })
      return
    }
    if (next.length < 8) {
      setResult({ ok: false, message: t('settings.security.newPasswordTooShort') })
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setResult({ ok: true, message: t('settings.security.passwordUpdated') })
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t('settings.security.title')}>
      <Field label={t('settings.security.currentPassword')} type="password" value={current} onChange={setCurrent} />
      <Field label={t('settings.security.newPassword')} type="password" value={next} onChange={setNext} />
      <Field label={t('settings.security.confirmPassword')} type="password" value={confirm} onChange={setConfirm} />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !current || !next}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50"
        >
          {busy && <Spinner className="w-3 h-3" />}
          {t('settings.security.changePassword')}
        </button>
        <ResultLine result={result} />
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  const { t } = useLanguage()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [results, setResults] = useState<Record<string, TestConnectionResult>>({})

  useEffect(() => {
    api.getSettings().then(setSettings).catch((err) => setLoadError(err instanceof Error ? err.message : t('common.error')))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- charge une seule fois au montage
  }, [])

  if (loadError) return <p className="text-sm text-red-400">{t('settings.loadError', { error: loadError })}</p>
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
      <h1 className="text-xl font-semibold mb-4">{t('common.settings')}</h1>

      <AppearanceSection />

      <Section title="MeTube">
        <Field label={t('settings.metube.urlLabel')} value={settings.metube_url ?? ''} onChange={(v) => set('metube_url', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('metube', api.testMetube)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            {t('settings.testConnection')}
          </button>
          <ResultLine result={results.metube ?? null} />
        </div>
        <Field
          label={t('settings.metube.publicUrlLabel')}
          value={settings.metube_public_url ?? ''}
          onChange={(v) => set('metube_public_url', v)}
        />
      </Section>

      <Section title={t('settings.navidrome.title')}>
        <Field label={t('settings.navidrome.urlLabel')} value={settings.navidrome_url ?? ''} onChange={(v) => set('navidrome_url', v)} />
        <Field label={t('settings.usernameLabel')} value={settings.navidrome_username ?? ''} onChange={(v) => set('navidrome_username', v)} />
        <Field label={t('settings.passwordLabel')} type="password" value={settings.navidrome_password ?? ''} onChange={(v) => set('navidrome_password', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('navidrome', api.testNavidrome)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            {t('settings.testConnection')}
          </button>
          <ResultLine result={results.navidrome ?? null} />
        </div>
      </Section>

      <LastfmSection settings={settings} setSettings={setSettings} />
      <ListenbrainzSection settings={settings} setSettings={setSettings} />

      <Section title={t('settings.email.title')}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.notify_email_enabled} onChange={(e) => set('notify_email_enabled', e.target.checked)} />
          {t('settings.email.enable')}
        </label>
        <Field label={t('settings.email.smtpHost')} value={settings.smtp_host ?? ''} onChange={(v) => set('smtp_host', v)} />
        <Field label={t('settings.email.smtpPort')} type="number" value={settings.smtp_port?.toString() ?? ''} onChange={(v) => set('smtp_port', v ? Number(v) : null)} />
        <Field label={t('settings.email.smtpUser')} value={settings.smtp_user ?? ''} onChange={(v) => set('smtp_user', v)} />
        <Field label={t('settings.email.smtpPassword')} type="password" value={settings.smtp_password ?? ''} onChange={(v) => set('smtp_password', v)} />
        <Field label={t('settings.email.fromAddress')} value={settings.smtp_from ?? ''} onChange={(v) => set('smtp_from', v)} />
        <Field label={t('settings.email.toAddress')} value={settings.smtp_to ?? ''} onChange={(v) => set('smtp_to', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('email', api.testEmail)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            {t('settings.email.sendTest')}
          </button>
          <ResultLine result={results.email ?? null} />
        </div>
      </Section>

      <Section title={t('settings.pushbullet.title')}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notify_pushbullet_enabled}
            onChange={(e) => set('notify_pushbullet_enabled', e.target.checked)}
          />
          {t('settings.pushbullet.enable')}
        </label>
        <Field label={t('settings.pushbullet.tokenLabel')} value={settings.pushbullet_token ?? ''} onChange={(v) => set('pushbullet_token', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('pushbullet', api.testPushbullet)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            {t('settings.pushbullet.sendTest')}
          </button>
          <ResultLine result={results.pushbullet ?? null} />
        </div>
      </Section>

      <Section title={t('settings.organization.title')}>
        <p className="text-sm text-app-text-muted">{t('settings.organization.description')}</p>
        <Field
          label={t('settings.organization.downloadsPathLabel')}
          value={settings.tagging_downloads_path}
          onChange={(v) => set('tagging_downloads_path', v)}
        />
        <Field
          label={t('settings.organization.libraryPathLabel')}
          value={settings.tagging_library_path}
          onChange={(v) => set('tagging_library_path', v)}
        />
      </Section>

      <Section title={t('settings.scan.title')}>
        <Field label={t('settings.scan.cronLabel')} value={settings.scan_cron} onChange={(v) => set('scan_cron', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('scan', api.runScanNow)} className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong">
            {t('settings.scan.runNow')}
          </button>
          <ResultLine result={results.scan ?? null} />
        </div>
      </Section>

      <CalendarSection settings={settings} setSettings={setSettings} />

      <SecuritySection />

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-app-accent hover:bg-app-accent-hover disabled:opacity-50">
          {saving ? t('settings.saving') : t('common.save')}
        </button>
        {savedAt && <span className="text-sm text-green-400">{t('settings.saved')}</span>}
      </div>
    </div>
  )
}
