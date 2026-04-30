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
  const [busy, setBusy] = useState<'upload' | 'remove' | 'link' | null>(null)
  const [linkUrl, setLinkUrl] = useState('')

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

  async function handleUseLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = linkUrl.trim()
    if (!trimmed) return
    setBusy('link')
    setError(null)
    try {
      const { logoUrl: nextUrl } = await api.gyms.logo.setUrl(gymId, trimmed)
      onChange?.(nextUrl)
      setLinkUrl('')
      await refreshGyms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that link')
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
        <form onSubmit={handleUseLink} className="flex flex-wrap items-center gap-2 pt-1">
          <label htmlFor={`gym-logo-url-${gymId}`} className="text-xs text-gray-400">
            Or paste a link:
          </label>
          <input
            id={`gym-logo-url-${gymId}`}
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            disabled={busy !== null}
            className="flex-1 min-w-[12rem] rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white placeholder-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={busy !== null || linkUrl.trim().length === 0}
          >
            {busy === 'link' ? 'Saving…' : 'Use link'}
          </Button>
        </form>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </div>
  )
}
