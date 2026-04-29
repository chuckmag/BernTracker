import { useState } from 'react'
import { api } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { useImageUpload } from '../lib/useImageUpload'
import GymLogo from './GymLogo'
import Button from './ui/Button'

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
// preview-confirm hop), Remove visible only when a logo is set. Refreshes
// GymContext so the TopBar picker thumbnails update without a manual reload.
export default function GymLogoUploader({ gymId, logoUrl, name, onChange }: GymLogoUploaderProps) {
  const { refreshGyms } = useGym()
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)

  const { inputProps, open, error, setError } = useImageUpload({
    ariaLabel: 'Choose a gym logo',
    onFile: async (file) => {
      setBusy('upload')
      try {
        const { logoUrl: nextUrl } = await api.gyms.logo.upload(gymId, file)
        onChange?.(nextUrl)
        await refreshGyms()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setBusy(null)
      }
    },
  })

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
        <p className="text-xs text-gray-400">JPEG, PNG, or WebP. Up to 20MB. Resized and cropped to a square.</p>
        <div className="flex flex-wrap gap-2">
          <input {...inputProps} />
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={open}
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
