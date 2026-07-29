import { useEffect, useState, type ReactNode } from 'react'
import { api, type Settings, type TestConnectionResult } from '../api'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-4">
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
      <span className="text-neutral-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-950 border border-neutral-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </label>
  )
}

function ResultLine({ result }: { result: TestConnectionResult | null }) {
  if (!result) return null
  return <p className={`text-xs ${result.ok ? 'text-green-400' : 'text-red-400'}`}>{result.message}</p>
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [results, setResults] = useState<Record<string, TestConnectionResult>>({})

  useEffect(() => {
    api.getSettings().then(setSettings)
  }, [])

  if (!settings) return <p className="text-neutral-400">Chargement...</p>

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

      <Section title="MeTube">
        <Field label="URL de MeTube (ex: http://metube:8081)" value={settings.metube_url ?? ''} onChange={(v) => set('metube_url', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('metube', api.testMetube)} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Tester la connexion
          </button>
          <ResultLine result={results.metube ?? null} />
        </div>
        <Field
          label="URL publique de MeTube (accessible depuis ton navigateur, pour l'onglet integre - ex: http://192.168.1.128:8081)"
          value={settings.metube_public_url ?? ''}
          onChange={(v) => set('metube_public_url', v)}
        />
      </Section>

      <Section title="Navidrome (verification de possession)">
        <Field label="URL de Navidrome" value={settings.navidrome_url ?? ''} onChange={(v) => set('navidrome_url', v)} />
        <Field label="Utilisateur" value={settings.navidrome_username ?? ''} onChange={(v) => set('navidrome_username', v)} />
        <Field label="Mot de passe" type="password" value={settings.navidrome_password ?? ''} onChange={(v) => set('navidrome_password', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('navidrome', api.testNavidrome)} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Tester la connexion
          </button>
          <ResultLine result={results.navidrome ?? null} />
        </div>
      </Section>

      <Section title="Last.fm">
        <Field label="Cle API (la meme que celle de Navidrome fonctionne)" value={settings.lastfm_api_key ?? ''} onChange={(v) => set('lastfm_api_key', v)} />
      </Section>

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
          <button onClick={() => runTest('email', api.testEmail)} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700">
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
          <button onClick={() => runTest('pushbullet', api.testPushbullet)} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Envoyer une notification de test
          </button>
          <ResultLine result={results.pushbullet ?? null} />
        </div>
      </Section>

      <Section title="Planification du scan">
        <Field label="Expression cron (ex: 0 6 * * * = tous les jours a 6h)" value={settings.scan_cron} onChange={(v) => set('scan_cron', v)} />
        <div className="flex items-center gap-3">
          <button onClick={() => runTest('scan', api.runScanNow)} className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700">
            Lancer un scan maintenant
          </button>
          <ResultLine result={results.scan ?? null} />
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {savedAt && <span className="text-sm text-green-400">Enregistre</span>}
      </div>
    </div>
  )
}
