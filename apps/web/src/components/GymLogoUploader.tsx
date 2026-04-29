import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import GymLogo from './GymLogo'
import Button from './ui/Button'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 5 * 1024 * 1024

interface GymLogoUploaderProps {
  gymId: string
  /** Current logo URL — typically threaded down from the page's gym row. */
  logoUrl: string | null
  /** Gym name for the initials fallback while the logo isn't set. */
  name: string
  /** Called after a successful upload/remove so the page can refresh its
   *  local gym snapshot. The picker re-fetches via GymContext.refreshGyms. */
  onChange?: (logoUrl: string | null) => void
}

// Mirror of AvatarUploader for the gym side. Single-button upload (no
// preview-confirm hop), Remove visible only when a logo is set, 5MB
// client-side guard matching the server cap. Refreshes GymContext so the
// TopBar picker thumbnails update without a manual reload.
export default function GymLogoUploader({ gymId, logoUrl, name, onChange }: GymLogoUploaderProps) {
  const { refreshGyms } = useGym()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`That file is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 5MB.`)
      return
    }
    setBusy('upload')
    setError(null)
    try {
      const { logoUrl: nextUrl } = await api.gyms.logo.upload(gymId, file)
      onChange?.(nextUrl)
      await refreshGyms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRemove() {
    setBusy('remove')
    setError(null)
    try {
      await api.gyms.logo.remove(gymId)
      onChange?.(null)
      await refreshGyms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove logo')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <GymLogo logoUrl={logoUrl} name={name} size="lg" />
      <div className="flex-1 space-y-2">
        <p className="text-sm text-white">Gym logo</p>
        <p className="text-xs text-gray-400">JPEG, PNG, or WebP. Up to 5MB. Resized and cropped to a square.</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileChange}
            aria-label="Choose a gym logo"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === 'upload' ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="tertiary"
              disabled={busy !== null}
              onClick={handleRemove}
            >
              {busy === 'remove' ? 'Removing…' : 'Remove'}
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  )
}
