// Crop a region of an image (the `Area` shape is the same one react-easy-crop
// emits via its `onCropComplete`) and return a JPEG Blob downscaled to fit
// within `maxSide` px. Server still resizes to its 512×512 canonical size, but
// shrinking here saves upload bytes for big phone-camera originals.
export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

export async function cropImageToBlob(args: {
  imageSrc: string
  area: CropArea
  /** Max dimension (px) of the longer side of the output. Default 1024. */
  maxSide?: number
  /** JPEG quality 0–1. Default 0.9. */
  quality?: number
}): Promise<Blob> {
  const { imageSrc, area, maxSide = 1024, quality = 0.9 } = args
  const image = await loadImage(imageSrc)

  const targetSide = Math.min(maxSide, Math.max(area.width, area.height))
  const canvas = document.createElement('canvas')
  canvas.width = targetSide
  canvas.height = targetSide
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2d canvas context')

  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, targetSide, targetSide)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas produced no blob'))),
      'image/jpeg',
      quality,
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

// Best-effort HEIC → JPEG conversion. Browsers (other than Safari on Apple
// platforms) can't render HEIC in <img>, so we convert client-side before
// previewing in the cropper. Falls back to throwing so the caller can show
// a friendly error.
export async function heicToJpegBlob(file: File): Promise<Blob> {
  // Lazy-load — heic2any is ~600KB and only the small subset of users with
  // iPhone-default HEIC need it. Top-level import would bloat every page.
  const mod = await import('heic2any')
  const heic2any = mod.default
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  // heic2any returns Blob | Blob[] depending on whether the source has multiple frames.
  return Array.isArray(out) ? out[0] : out
}

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  )
}
