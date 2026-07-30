import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, type MetubeHistory, type MetubeItem } from '../api'
import MetubeItemRow from '../components/MetubeItemRow'

const POLL_MS = 1500

const AUDIO_FORMATS = ['mp3', 'm4a', 'opus', 'wav', 'flac']
const AUDIO_QUALITIES = ['best', '320', '192', '128']
const VIDEO_FORMATS = ['any', 'mp4', 'webm']
const VIDEO_QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360']

type DownloadType = 'video' | 'audio' | 'captions' | 'thumbnail'

function Section({ title, items, children }: { title: string; items: MetubeItem[]; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-medium mb-2">
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Rien ici.</p>
      ) : (
        <div className="flex flex-col gap-1.5">{children}</div>
      )}
    </div>
  )
}

export default function MetubePage() {
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [history, setHistory] = useState<MetubeHistory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  const [url, setUrl] = useState('')
  const [downloadType, setDownloadType] = useState<DownloadType>('audio')
  const [format, setFormat] = useState('mp3')
  const [quality, setQuality] = useState('best')
  const [folder, setFolder] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addMessage, setAddMessage] = useState<string | null>(null)

  const pollRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const h = await api.metubeHistory()
      setHistory(h)
      setLoadError(null)
      setNotConfigured(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      if (msg.includes('422')) {
        setNotConfigured(true)
      } else {
        setLoadError(msg)
      }
    }
  }, [])

  useEffect(() => {
    refresh()
    pollRef.current = window.setInterval(refresh, POLL_MS)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [refresh])

  useEffect(() => {
    api.getSettings().then((s) => setPublicUrl(s.metube_public_url))
  }, [])

  function onTypeChange(type: DownloadType) {
    setDownloadType(type)
    if (type === 'audio') {
      setFormat('mp3')
      setQuality('best')
    } else if (type === 'video') {
      setFormat('any')
      setQuality('best')
    }
  }

  async function addDownload(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setAdding(true)
    setAddMessage(null)
    try {
      const result = await api.metubeAdd({
        url: url.trim(),
        download_type: downloadType,
        quality,
        format: downloadType === 'video' && format === 'any' ? undefined : format,
        folder: folder.trim() || undefined,
        auto_start: true,
      })
      if (result.status === 'error') {
        setAddMessage(result.msg || "Echec de l'ajout")
      } else {
        setUrl('')
        setAddMessage(null)
        refresh()
      }
    } catch (err) {
      setAddMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setAdding(false)
    }
  }

  async function deleteItem(id: string, where: 'queue' | 'done') {
    await api.metubeDelete([id], where)
    refresh()
  }

  async function retryItem(id: string) {
    await api.metubeRetry(id)
    refresh()
  }

  async function startItem(id: string) {
    await api.metubeStart([id])
    refresh()
  }

  if (notConfigured) {
    return (
      <div className="text-neutral-400">
        <p>URL MeTube non configuree.</p>
        <p className="mt-2">
          Renseigne-la dans <span className="text-neutral-300">Reglages</span> (section MeTube) pour geror tes
          telechargements ici.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">MeTube</h1>
        <div className="flex items-center gap-3">
          {loadError && <span className="text-xs text-red-400">{loadError}</span>}
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-neutral-400 hover:text-white"
              title="Fonctionnalites avancees (cookies, abonnements...) non reprises ici"
            >
              Ouvrir l'interface MeTube complete ↗
            </a>
          )}
        </div>
      </div>

      <form onSubmit={addDownload} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Colle un lien YouTube / YouTube Music..."
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="px-4 py-2 rounded-md bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-sm whitespace-nowrap"
          >
            {adding ? 'Ajout...' : 'Telecharger'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="text-xs text-neutral-400 hover:text-white mt-2"
        >
          {advancedOpen ? '▾' : '▸'} Options avancees
        </button>

        {advancedOpen && (
          <div className="flex gap-3 mt-2 flex-wrap items-end">
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              Type
              <select
                value={downloadType}
                onChange={(e) => onTypeChange(e.target.value as DownloadType)}
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
              >
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="captions">Sous-titres</option>
                <option value="thumbnail">Miniature</option>
              </select>
            </label>
            {(downloadType === 'audio' || downloadType === 'video') && (
              <>
                <label className="flex flex-col gap-1 text-xs text-neutral-400">
                  Format
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
                  >
                    {(downloadType === 'audio' ? AUDIO_FORMATS : VIDEO_FORMATS).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-neutral-400">
                  Qualite
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
                  >
                    {(downloadType === 'audio' ? AUDIO_QUALITIES : VIDEO_QUALITIES).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="flex flex-col gap-1 text-xs text-neutral-400">
              Dossier (optionnel)
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="ex: artiste"
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        {addMessage && <p className="text-xs text-red-400 mt-2">{addMessage}</p>}
      </form>

      {history && (
        <>
          <Section title="En cours" items={history.queue}>
            {history.queue.map((item) => (
              <MetubeItemRow key={item.id} item={item} onDelete={() => deleteItem(item.id, 'queue')} />
            ))}
          </Section>

          <Section title="En attente" items={history.pending}>
            {history.pending.map((item) => (
              <MetubeItemRow
                key={item.id}
                item={item}
                onDelete={() => deleteItem(item.id, 'queue')}
                onStart={() => startItem(item.id)}
              />
            ))}
          </Section>

          <Section title="Termine" items={history.done}>
            {history.done.map((item) => (
              <MetubeItemRow
                key={item.id}
                item={item}
                onDelete={() => deleteItem(item.id, 'done')}
                onRetry={item.status === 'error' ? () => retryItem(item.id) : undefined}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}
