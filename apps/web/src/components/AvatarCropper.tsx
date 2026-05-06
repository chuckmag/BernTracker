import { useCallback, useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import Button from './ui/Button'
import { cropImageToBlob, type CropArea } from '../lib/cropImage'

interface AvatarCropperProps {
  /** ObjectURL or data URL of the (already-decoded — non-HEIC) image. */
  imageSrc: string
  /** Cropping is square — avatars render in circles + squares everywhere. */
  onSave: (blob: Blob) => void | Promise<void>
  onCancel: () => void
  /** Disable controls while the parent is uploading. */
  saving?: boolean
}

// Modal cropper — replaces the old "auto-crop center cover" behavior that
// produced morphed/awkward results. User pans and zooms a square crop window;
// "Save" downscales the cropped region to JPEG and hands it back to the
// uploader.
export default function AvatarCropper({ imageSrc, onSave, onCancel, saving = false }: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null)

  const onCropComplete = useCallback((_: unknown, areaPixels: CropArea) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  // Esc closes the modal — we don't auto-close on overlay click since the
  // cropper takes the full inner area and it's easy to miss-click there.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  async function handleSave() {
    if (!croppedAreaPixels) return
    const blob = await cropImageToBlob({ imageSrc, area: croppedAreaPixels })
    await onSave(blob)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop your photo"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Crop your photo</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400">Drag to position, scroll or use the slider to zoom.</p>
        </div>
        <div className="relative bg-black h-80">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-gray-800 flex items-center gap-3">
          <label className="flex-1 flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
            <span className="shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-indigo-500"
            />
          </label>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-gray-800 flex justify-end gap-2">
          <Button type="button" variant="tertiary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !croppedAreaPixels}>
            {saving ? 'Uploading…' : 'Save photo'}
          </Button>
        </div>
      </div>
    </div>
  )
}
