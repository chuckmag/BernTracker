import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext.tsx'
import Avatar from './Avatar'
import Button from './ui/Button'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 5 * 1024 * 1024

interface AvatarUploaderProps {
  /** Visual size of the avatar. Defaults to lg for /profile placement. */
  size?: 'md' | 'lg'
  /** Optional copy block beside the avatar; defaults to a generic helper. */
  helper?: React.ReactNode
}

// Avatar + change/remove controls. Uploads happen immediately on file select
// (no preview-and-confirm hop) — the file picker IS the confirmation step,
// and the round trip is fast enough that an extra "Save" button just adds
// friction. After success we refresh /auth/me so AuthContext.user.avatarUrl
// updates everywhere (TopBar, Profile, Onboarding).
export default function AvatarUploader({ size = 'lg', helper }: AvatarUploaderProps) {
  const { user, accessToken, login } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  async function refreshUser() {
    if (!accessToken) return
    try {
      const me = await api.auth.me(accessToken)
      login(accessToken, me)
    } catch {
      // best-effort — the next /auth/me roundtrip will pick up the new URL.
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    if (file.size > MAX_BYTES) {
      setError(`That file is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 5MB.`)
      return
    }

    setBusy('upload')
    setError(null)
    try {
      await api.users.me.avatar.upload(file)
      await refreshUser()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRemove() {
    setBusy('remove')
    setError(null)
    try {
      await api.users.me.avatar.remove()
      await refreshUser()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove avatar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <Avatar
        avatarUrl={user.avatarUrl}
        firstName={user.firstName}
        lastName={user.lastName}
        email={user.email}
        size={size}
      />
      <div className="flex-1 space-y-2">
        {helper ?? <p className="text-sm text-white">Profile photo</p>}
        <p className="text-xs text-gray-400">JPEG, PNG, or WebP. Up to 5MB. We'll resize and crop to a square.</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileChange}
            aria-label="Choose a profile photo"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === 'upload' ? 'Uploading…' : user.avatarUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {user.avatarUrl && (
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
