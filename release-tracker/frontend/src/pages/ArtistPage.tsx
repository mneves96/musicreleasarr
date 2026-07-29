import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ALL_RELEASE_TYPES, api, RELEASE_TYPE_LABELS, type ArtistWithReleases, type ReleaseType } from '../api'
import ReleaseRow from '../components/ReleaseRow'

const FILTER_TYPES: (ReleaseType | 'all')[] = ['all', 'album', 'ep', 'single', 'compilation', 'other']

export default function ArtistPage() {
  const { id } = useParams()
  const artistId = Number(id)
  const [artist, setArtist] = useState<ArtistWithReleases | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<ReleaseType | 'all'>('all')

  const load = useCallback(() => {
    api.getArtist(artistId).then(setArtist)
  }, [artistId])

  useEffect(() => {
    load()
  }, [load])

  if (!artist) return <p className="text-neutral-400">Chargement...</p>

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
          <img src={artist.image_url} alt="" className="w-20 h-20 rounded-full object-cover bg-neutral-800" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center text-2xl">🎤</div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{artist.name}</h1>
            <button
              onClick={refresh}
              disabled={scanning}
              className="text-xs px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 whitespace-nowrap"
            >
              {scanning ? 'Scan en cours...' : '↻ Actualiser'}
            </button>
            {scanMessage && <span className="text-xs text-neutral-400">{scanMessage}</span>}
          </div>
          <div className="flex gap-3 text-sm mt-1">
            {artist.lastfm_url && (
              <a href={artist.lastfm_url} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-white">
                Last.fm
              </a>
            )}
            <a
              href={`https://musicbrainz.org/artist/${artist.musicbrainz_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-400 hover:text-white"
            >
              MusicBrainz
            </a>
            {artist.deezer_id && (
              <a
                href={`https://www.deezer.com/artist/${artist.deezer_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-400 hover:text-white"
              >
                Deezer
              </a>
            )}
            {artist.ytmusic_url && (
              <a href={artist.ytmusic_url} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-white">
                YouTube Music
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 mb-6">
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
            <div className="text-sm text-neutral-400 mb-1">Types de sortie suivis :</div>
            <div className="flex gap-2 flex-wrap">
              {ALL_RELEASE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  disabled={saving}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    artist.followed_release_types.includes(type)
                      ? 'bg-purple-700 border-purple-600'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {RELEASE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(() => {
        const filtered =
          typeFilter === 'all' ? artist.releases : artist.releases.filter((r) => r.release_type === typeFilter)
        return (
          <>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h2 className="font-medium">
                Sorties ({filtered.length}
                {typeFilter !== 'all' && ` / ${artist.releases.length}`})
              </h2>
              <div className="flex gap-2 flex-wrap">
                {FILTER_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      typeFilter === type
                        ? 'bg-purple-700 border-purple-600'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {type === 'all' ? 'Toutes' : RELEASE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {filtered.length === 0 && (
                <p className="text-neutral-400 text-sm">
                  {artist.releases.length === 0
                    ? 'Aucune sortie trouvee pour le moment (le premier scan n\'a peut-etre pas encore tourne).'
                    : 'Aucune sortie de ce type.'}
                </p>
              )}
              {filtered.map((r) => (
                <ReleaseRow key={r.id} release={r} onChanged={load} />
              ))}
            </div>
          </>
        )
      })()}
    </div>
  )
}
