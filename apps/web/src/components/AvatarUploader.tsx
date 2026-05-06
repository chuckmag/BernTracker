import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext.tsx'
import { useImageUpload, IMAGE_ACCEPT_WITH_HEIC } from '../lib/useImageUpload'
import Avatar from './Avatar'
import Button from './ui/Button'
import AvatarCropper from './AvatarCropper'
import { heicToJpegBlob, isHeicFile } from '../lib/cropImage'

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
  const [busy, setBusy] = useState<'prepare' | 'upload' | 'remove' | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  const { inputProps, open, error, setError } = useImageUpload({
    ariaLabel: 'Choose a profile photo',
    accept: IMAGE_ACCEPT_WITH_HEIC,
    onFile: async (file) => {
      setBusy('prepare')
      try {
        const viewableBlob: Blob = isHeicFile(file) ? await heicToJpegBlob(file) : file
        setPreviewSrc(URL.createObjectURL(viewableBlob))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that file. Try a JPEG, PNG, or WebP.')
      } finally {
        setBusy(null)
      }
    },
  })

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
          {helper ?? <p className="text-sm text-slate-950 dark:text-white">Profile photo</p>}
          <p className="text-xs text-slate-500 dark:text-gray-400">JPEG, PNG, WebP, or HEIC. Up to 20MB. You'll crop it to a square before saving.</p>
          <div className="flex flex-wrap gap-2">
            <input {...inputProps} />
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={open}
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
