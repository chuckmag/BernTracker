import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext.tsx'
import Avatar from './Avatar'
import Button from './ui/Button'
import AvatarCropper from './AvatarCropper'
import { heicToJpegBlob, isHeicFile } from '../lib/cropImage'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'
const MAX_BYTES = 20 * 1024 * 1024

interface AvatarUploaderProps {
  /** Visual size of the avatar. Defaults to lg for /profile placement. */
  size?: 'md' | 'lg'
  /** Optional copy block beside the avatar; defaults to a generic helper. */
  helper?: React.ReactNode
}

// Avatar + change/remove controls. Flow:
//  1. Pick file → if HEIC, convert client-side to JPEG via heic2any (browsers
//     can't render HEIC in <img> outside Safari/iOS).
//  2. Open AvatarCropper modal — user pans/zooms a square crop.
//  3. Save → canvas extracts crop, downscales to JPEG, uploads to API.
//  4. Server still does its 512×512 WebP normalize for the canonical avatar.
// Refreshes /auth/me afterwards so AuthContext.user.avatarUrl propagates.
export default function AvatarUploader({ size = 'lg', helper }: AvatarUploaderProps) {
  const { user, accessToken, login } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'prepare' | 'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  // Free the ObjectURL when the cropper closes (or the component unmounts) so
  // we don't leak the underlying blob in memory.
  useEffect(() => {
    return () => {
      if (previewSrc) URL.revokeObjectURL(previewSrc)
    }
  }, [previewSrc])

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
      setError(`That file is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 20MB.`)
      return
    }

    setError(null)
    setBusy('prepare')
    try {
      let viewableBlob: Blob = file
      if (isHeicFile(file)) {
        viewableBlob = await heicToJpegBlob(file)
      }
      const url = URL.createObjectURL(viewableBlob)
      setPreviewSrc(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file. Try a JPEG, PNG, or WebP.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCropSave(blob: Blob) {
    setBusy('upload')
    setError(null)
    try {
      const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      await api.users.me.avatar.upload(cropped)
      await refreshUser()
      closeCropper()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  function closeCropper() {
    if (previewSrc) URL.revokeObjectURL(previewSrc)
    setPreviewSrc(null)
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
    <>
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
          <p className="text-xs text-gray-400">JPEG, PNG, WebP, or HEIC. Up to 20MB. You'll crop it to a square before saving.</p>
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
              {busy === 'prepare' ? 'Preparing…' : busy === 'upload' ? 'Uploading…' : user.avatarUrl ? 'Change photo' : 'Upload photo'}
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
      {previewSrc && (
        <AvatarCropper
          imageSrc={previewSrc}
          onSave={handleCropSave}
          onCancel={closeCropper}
          saving={busy === 'upload'}
        />
      )}
    </>
  )
}
