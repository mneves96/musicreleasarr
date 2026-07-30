import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, type MetubeHistory, type MetubeItem } from '../api'
import MetubeItemRow from '../components/MetubeItemRow'

const ACTIVE_POLL_MS = 1000
const IDLE_POLL_MS = 8000

const AUDIO_FORMATS = ['mp3', 'm4a', 'opus', 'wav', 'flac']
const AUDIO_QUALITIES = ['best', '320', '192', '128']
const VIDEO_FORMATS = ['any', 'mp4', 'webm']
const VIDEO_QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360']

type DownloadType = 'video' | 'audio' | 'captions' | 'thumbnail'
type Bucket = 'queue' | 'pending' | 'done'

function Section({
  title,
  items,
  collapsed,
  onToggle,
  actions,
  children,
}: {
  title: string
  items: MetubeItem[]
  collapsed: boolean
  onToggle: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onToggle} className="flex items-center gap-2 font-medium hover:text-neutral-300">
          <span className="text-neutral-500 text-xs">{collapsed ? '▸' : '▾'}</span>
          {title} ({items.length})
        </button>
        {!collapsed && actions}
      </div>
      {!collapsed &&
        (items.length === 0 ? (
          <p className="text-sm text-neutral-500">Rien ici.</p>
        ) : (
          <div className="flex flex-col gap-1.5">{children}</div>
        ))}
    </div>
  )
}

export default function MetubePage() {
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [history, setHistory] = useState<MetubeHistory | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [collapsed, setCollapsed] = useState<Record<Bucket, boolean>>({ queue: false, pending: false, done: false })

  const [url, setUrl] = useState('')
  const [downloadType, setDownloadType] = useState<DownloadType>('audio')
  const [format, setFormat] = useState('mp3')
  const [quality, setQuality] = useState('best')
  const [folder, setFolder] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addMessage, setAddMessage] = useState<string | null>(null)

  const pollRef = useRef<number | null>(null)
  // Empeche les requetes qui se chevauchent : a 1s d'intervalle, si le backend (qui
  // relaie vers MeTube, potentiellement charge par un telechargement en cours) met
  // plus d'une seconde a repondre, une reponse plus lente pouvait ecraser une reponse
  // plus recente et donner une impression de "sautillement"/instabilite.
  const inFlightRef = useRef(false)

  const refresh = useCallback(async (showSpinner = false) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    if (showSpinner) setRefreshing(true)
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
    } finally {
      inFlightRef.current = false
      if (showSpinner) setRefreshing(false)
    }
  }, [])

  // Rafraichissement plus frequent quand l'onglet est actif/visible, plus espace
  // sinon (pas besoin de marteler l'API pendant que la page est en arriere-plan).
  useEffect(() => {
    function schedule() {
      if (pollRef.current) window.clearInterval(pollRef.current)
      const delay = document.visibilityState === 'visible' ? ACTIVE_POLL_MS : IDLE_POLL_MS
      pollRef.current = window.setInterval(refresh, delay)
    }

    function onVisibilityChange() {
      schedule()
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    schedule()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [refresh])

  useEffect(() => {
    api.getSettings().then((s) => setPublicUrl(s.metube_public_url))
  }, [])

  function toggleSection(bucket: Bucket) {
    setCollapsed((c) => ({ ...c, [bucket]: !c[bucket] }))
  }

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

  // Mise a jour optimiste (l'element disparait immediatement) : sans ca, l'appui sur
  // la croix pouvait sembler "ne rien faire" jusqu'au prochain sondage, et un sondage
  // deja en vol pouvait meme faire reapparaitre l'element juste supprime.
  function removeLocally(bucket: Bucket, id: string) {
    setHistory((h) => (h ? { ...h, [bucket]: h[bucket].filter((i) => i.id !== id) } : h))
  }

  // IMPORTANT : l'API MeTube identifie les telechargements par leur URL en interne
  // (PersistentQueue est indexee par info.url), pas par le champ "id" expose dans
  // /history (qui est l'id YouTube de la video/playlist). Envoyer "id" a la place de
  // l'URL fait echouer silencieusement delete/retry/start : MeTube ne trouve rien a
  // cette cle, ne fait rien, et renvoie quand meme {"status": "ok"} - d'ou l'element
  // qui "revenait" au sondage suivant alors que rien n'avait vraiment ete supprime.
  async function deleteItem(bucket: Bucket, item: MetubeItem) {
    removeLocally(bucket, item.id)
    try {
      await api.metubeDelete([item.url], bucket === 'done' ? 'done' : 'queue')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur de suppression')
      refresh()
    }
  }

  async function clearDone(filter: 'finished' | 'error' | 'all') {
    if (!history) return
    const items = history.done.filter((i) => filter === 'all' || i.status === filter)
    if (items.length === 0) return
    const localIds = items.map((i) => i.id)
    setHistory((h) => (h ? { ...h, done: h.done.filter((i) => !localIds.includes(i.id)) } : h))
    try {
      await api.metubeDelete(items.map((i) => i.url), 'done')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur')
      refresh()
    }
  }

  async function retryItem(item: MetubeItem) {
    await api.metubeRetry(item.url)
    refresh()
  }

  async function retryAllErrors() {
    if (!history) return
    const errorItems = history.done.filter((i) => i.status === 'error')
    if (errorItems.length === 0) return
    await Promise.all(errorItems.map((i) => api.metubeRetry(i.url)))
    refresh()
  }

  async function startItem(item: MetubeItem) {
    await api.metubeStart([item.url])
    refresh()
  }

  if (notConfigured) {
    return (
      <div className="text-neutral-400">
        <p>URL MeTube non configuree.</p>
        <p className="mt-2">
          Renseigne-la dans <span className="text-neutral-300">Reglages</span> (section MeTube) pour gerer tes
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
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
          >
            {refreshing ? 'Actualisation...' : '↻ Actualiser'}
          </button>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-neutral-400 hover:text-white"
              title="Fonctionnalites avancees (cookies, abonnements...) non reprises ici"
            >
              Interface complete ↗
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
          <Section
            title="En cours"
            items={history.queue}
            collapsed={collapsed.queue}
            onToggle={() => toggleSection('queue')}
          >
            {history.queue.map((item) => (
              <MetubeItemRow key={item.id} item={item} onDelete={() => deleteItem('queue', item)} />
            ))}
          </Section>

          <Section
            title="En attente"
            items={history.pending}
            collapsed={collapsed.pending}
            onToggle={() => toggleSection('pending')}
          >
            {history.pending.map((item) => (
              <MetubeItemRow
                key={item.id}
                item={item}
                onDelete={() => deleteItem('pending', item)}
                onStart={() => startItem(item)}
              />
            ))}
          </Section>

          <Section
            title="Termine"
            items={history.done}
            collapsed={collapsed.done}
            onToggle={() => toggleSection('done')}
            actions={
              <div className="flex gap-1.5">
                <button
                  onClick={retryAllErrors}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700"
                >
                  Reessayer les echecs
                </button>
                <button
                  onClick={() => clearDone('finished')}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700"
                >
                  Effacer les reussis
                </button>
                <button
                  onClick={() => clearDone('error')}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700"
                >
                  Effacer les echecs
                </button>
                <button
                  onClick={() => clearDone('all')}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-800 hover:bg-red-900/50"
                >
                  Tout effacer
                </button>
              </div>
            }
          >
            {history.done.map((item) => (
              <MetubeItemRow
                key={item.id}
                item={item}
                onDelete={() => deleteItem('done', item)}
                onRetry={item.status === 'error' ? () => retryItem(item) : undefined}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}
