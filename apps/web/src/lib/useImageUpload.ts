import { useRef, useState } from 'react'

// Matches the cap on the API's shared imageUploadMiddleware. Keep both sides
// in sync — bumping one without the other surfaces as a confusing 413 from
// the server after the client cleared the picker.
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024

// Server allowlist (sharp's default build can decode these). HEIC is handled
// client-side by converting to JPEG before upload — see IMAGE_ACCEPT_WITH_HEIC.
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
export const IMAGE_ACCEPT_WITH_HEIC =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

export interface UseImageUploadOptions {
  /** Called once a picked file passes validation. Consumer decides what to do
   *  next (open cropper, upload immediately, queue for batch, etc.). */
  onFile: (file: File) => void | Promise<void>
  /** A11y label for the hidden file input. */
  ariaLabel: string
  /** Accept attribute. Defaults to JPEG/PNG/WebP. */
  accept?: string
  /** Max raw bytes. Defaults to IMAGE_MAX_BYTES. */
  maxBytes?: number
}

/**
 * Encapsulates the picker plumbing every image-upload UI shares: a hidden
 * file input, a click-to-open trigger, a size guard with a consistent error
 * message, and reset of `input.value` so re-picking the same file refires.
 *
 * Consumers render `<input {...inputProps} />` and any trigger they like
 * (`<Button onClick={open}>…`). They also own their own busy state and
 * post-validation flow (HEIC convert, cropper modal, direct upload, …).
 */
export function useImageUpload({
  onFile,
  ariaLabel,
  accept = IMAGE_ACCEPT,
  maxBytes = IMAGE_MAX_BYTES,
}: UseImageUploadOptions) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function open() {
    inputRef.current?.click()
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return

    if (file.size > maxBytes) {
      setError(
        `That file is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is ${maxBytes / 1024 / 1024}MB.`,
      )
      return
    }

    setError(null)
    await onFile(file)
  }

  const inputProps = {
    ref: inputRef,
    type: 'file' as const,
    accept,
    className: 'hidden',
    onChange: handleChange,
    'aria-label': ariaLabel,
  }

  return { inputProps, open, error, setError }
}
