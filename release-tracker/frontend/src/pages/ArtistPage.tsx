import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ALL_RELEASE_TYPES, api, RELEASE_TYPE_LABELS, type ArtistWithReleases, type ReleaseType, type Track } from '../api'
import ReleaseRow from '../components/ReleaseRow'
import TopTracksSection from '../components/TopTracksSection'
import SimilarArtistsSection from '../components/SimilarArtistsSection'
import ServiceLink from '../components/ServiceLink'
import { DeezerIcon, LastfmIcon, MusicBrainzIcon, YoutubeMusicIcon } from '../components/ServiceIcons'
import Spinner, { LoadingBlock } from '../components/Spinner'

const FILTER_TYPES: (ReleaseType | 'all')[] = ['all', 'album', 'ep', 'single', 'compilation', 'other']

// Le premier scan (decouverte MusicBrainz + resolution YouTube Music) tourne en
// arriere-plan des le suivi/la previsualisation - on sonde donc la fiche le temps
// qu'il se termine, plutot que de laisser la page paraitre vide indefiniment.
const SCAN_POLL_INTERVAL_MS = 3000
const SCAN_POLL_MAX_TICKS = 20 // ~1 minute

export default function ArtistPage() {
  const { id } = useParams()
  const artistId = Number(id)
  const [artist, setArtist] = useState<ArtistWithReleases | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<ReleaseType | 'all'>('all')
  const [sortDesc, setSortDesc] = useState(true)
  const [query, setQuery] = useState('')
  const [tracksByRelease, setTracksByRelease] = useState<Record<number, Track[]>>({})
  const [awaitingScan, setAwaitingScan] = useState(false)
  const scanPollTicks = useRef(0)

  const load = useCallback(() => {
    return api.getArtist(artistId).then(setArtist)
  }, [artistId])

  useEffect(() => {
    setArtist(null)
    scanPollTicks.current = 0
    load()
  }, [load])

  // Le scan initial (lance en arriere-plan par le backend au moment de suivre/
  // previsualiser un artiste, voir routers/artists.py:_scan_in_background) peut
  // prendre jusqu'a une minute sur un catalogue important - on sonde tant
  // qu'aucune sortie n'est encore visible, pour afficher les resultats des
  // qu'ils arrivent sans que l'utilisateur ait a rafraichir la page
  // manuellement. Reprogramme un seul sondage a la fois (plutot qu'un
  // setInterval) : des que "artist" est remplace par une version avec des
  // sorties, cet effet se re-declenche et s'arrete de lui-meme au lieu de
  // continuer jusqu'a la limite de temps.
  //
  // Les artistes recommandes Last.fm (is_recommended) ne beneficient jamais de
  // ce scan automatique - genere en masse chaque nuit, le declencher pour
  // chacun saturerait MusicBrainz (1 requete/seconde) - donc sonder ici pour
  // eux attendait indefiniment des sorties qui n'arriveraient jamais. Le
  // bouton "Actualiser" reste le moyen de lancer ce scan a la demande.
  useEffect(() => {
    if (!artist || artist.is_recommended || artist.releases.length > 0 || scanPollTicks.current >= SCAN_POLL_MAX_TICKS) {
      setAwaitingScan(false)
      return
    }
    setAwaitingScan(true)
    const timeout = window.setTimeout(() => {
      scanPollTicks.current += 1
      load()
    }, SCAN_POLL_INTERVAL_MS)
    return () => window.clearTimeout(timeout)
  }, [artist, load])

  function onTracksLoaded(releaseId: number, tracks: Track[]) {
    setTracksByRelease((prev) => ({ ...prev, [releaseId]: tracks }))
  }

  if (!artist) return <LoadingBlock />

  async function updateFollow(patch: Partial<ArtistWithReleases>) {
    setSaving(true)
    try {
      await api.updateArtist(artistId, patch)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function refresh() {
    setScanning(true)
    setScanMessage(null)
    try {
      await api.scanArtist(artistId)
      await load()
      setScanMessage('A jour')
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Echec du scan')
    } finally {
      setScanning(false)
    }
  }

  function toggleType(type: ReleaseType) {
    const current = artist!.followed_release_types
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    updateFollow({ followed_release_types: next })
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        {artist.image_url ? (
          <img src={artist.image_url} alt="" className="w-20 h-20 rounded-full object-cover bg-app-surface-hover" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-app-surface-hover flex items-center justify-center text-2xl">🎤</div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{artist.name}</h1>
            <button
              onClick={refresh}
              disabled={scanning}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-app-surface-hover hover:bg-app-border-strong disabled:opacity-50 whitespace-nowrap"
            >
              {scanning && <Spinner className="w-3 h-3" />}
              {scanning ? 'Scan en cours...' : '↻ Actualiser'}
            </button>
            {scanMessage && <span className="text-xs text-app-text-muted">{scanMessage}</span>}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <ServiceLink
              href={`https://musicbrainz.org/artist/${artist.musicbrainz_id}`}
              label="MusicBrainz"
              icon={<MusicBrainzIcon />}
            />
            <ServiceLink
              href={artist.deezer_id ? `https://www.deezer.com/artist/${artist.deezer_id}` : null}
              label="Deezer"
              icon={<DeezerIcon />}
            />
            <ServiceLink href={artist.ytmusic_url} label="YouTube Music" icon={<YoutubeMusicIcon />} />
            <ServiceLink href={artist.lastfm_url} label="Last.fm" icon={<LastfmIcon />} />
          </div>
        </div>
      </div>

      <div className="bg-app-surface border border-app-border rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3">Parametres de suivi</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={artist.is_followed}
              disabled={saving}
              onChange={(e) => updateFollow({ is_followed: e.target.checked })}
            />
            Suivre cet artiste
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={artist.notify_enabled}
              disabled={saving}
              onChange={(e) => updateFollow({ notify_enabled: e.target.checked })}
            />
            Me notifier des nouvelles sorties
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={artist.auto_download}
              disabled={saving}
              onChange={(e) => updateFollow({ auto_download: e.target.checked })}
            />
            Telecharger automatiquement les sorties manquantes
          </label>
          <div>
            <div className="text-sm text-app-text-muted mb-1">Types de sortie suivis :</div>
            <div className="flex gap-2 flex-wrap">
              {ALL_RELEASE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  disabled={saving}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    artist.followed_release_types.includes(type)
                      ? 'bg-app-accent border-app-accent'
                      : 'bg-app-surface-hover border-app-border-strong text-app-text-muted'
                  }`}
                >
                  {RELEASE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <TopTracksSection artistId={artist.id} artistName={artist.name} />

      {artist.is_followed && <SimilarArtistsSection artistId={artist.id} />}

      {awaitingScan && (
        <div className="flex items-center gap-2 text-sm text-app-text-muted mb-4 bg-app-surface border border-app-border rounded-lg px-3 py-2">
          <Spinner className="w-4 h-4" />
          Scan en cours, ca peut prendre jusqu'a une minute pour un catalogue important...
        </div>
      )}

      {(() => {
        const q = query.trim().toLowerCase()
        let filtered = typeFilter === 'all' ? artist.releases : artist.releases.filter((r) => r.release_type === typeFilter)
        if (q) {
          filtered = filtered.filter(
            (r) =>
              r.title.toLowerCase().includes(q) ||
              (tracksByRelease[r.id] ?? []).some((t) => t.title.toLowerCase().includes(q))
          )
        }
        filtered = [...filtered].sort((a, b) => {
          const cmp = (a.release_date ?? '').localeCompare(b.release_date ?? '')
          return sortDesc ? -cmp : cmp
        })
        return (
          <>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h2 className="font-medium">
                Sorties ({filtered.length}
                {(typeFilter !== 'all' || q) && ` / ${artist.releases.length}`})
              </h2>
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher un titre (release ou piste deja consultee)..."
                  className="bg-app-surface border border-app-border-strong rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
                <button
                  onClick={() => setSortDesc((v) => !v)}
                  title={sortDesc ? 'Plus recentes en premier' : 'Plus anciennes en premier'}
                  className="text-xs px-3 py-1.5 rounded-md bg-app-surface-hover border border-app-border-strong hover:bg-app-border-strong whitespace-nowrap"
                >
                  Date {sortDesc ? '↓' : '↑'}
                </button>
                {FILTER_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      typeFilter === type
                        ? 'bg-app-accent border-app-accent'
                        : 'bg-app-surface-hover border-app-border-strong text-app-text-muted'
                    }`}
                  >
                    {type === 'all' ? 'Toutes' : RELEASE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {filtered.length === 0 && (
                <p className="text-app-text-muted text-sm">
                  {artist.releases.length === 0
                    ? artist.is_recommended
                      ? 'Aucune sortie chargee pour le moment - clique sur "Actualiser" pour decouvrir la discographie de cet artiste.'
                      : 'Aucune sortie trouvee pour le moment (le premier scan n\'a peut-etre pas encore tourne).'
                    : 'Aucune sortie ne correspond au filtre.'}
                </p>
              )}
              {filtered.map((r) => (
                <ReleaseRow key={r.id} release={r} onChanged={load} onTracksLoaded={onTracksLoaded} />
              ))}
            </div>
          </>
        )
      })()}
    </div>
  )
}
