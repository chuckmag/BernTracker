import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { processAvatarBuffer } from './imageProcessing.js'
import { getImageStorage } from './imageStorage.js'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Shared multer instance for any image-upload route. memoryStorage so sharp
// can transform the bytes before they touch S3 — no temp files.
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error(`Unsupported image type: ${file.mimetype}. Use JPEG, PNG, or WebP.`))
      return
    }
    cb(null, true)
  },
})

// Multer error → friendly 4xx. Shared by every route that uses imageUpload.
export function imageUploadErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).` })
      return
    }
    res.status(400).json({ error: err.message })
    return
  }
  if (err instanceof Error && err.message.startsWith('Unsupported image type:')) {
    res.status(400).json({ error: err.message })
    return
  }
  next(err)
}

/**
 * Validate → resize → re-encode → upload. Returns the public URL the storage
 * backend assigned. Caller persists it to whatever model field needs it
 * (User.avatarUrl, Gym.logoUrl, future …).
 *
 * Use a stable `keyPrefix` per resource so cleanup queries can wildcard:
 *   avatars/<userId>
 *   gyms/<gymId>
 *
 * Throws when sharp can't decode the bytes; the route handler should catch
 * and return 400.
 */
export async function processAndStoreImage(args: {
  file: Express.Multer.File
  keyPrefix: string
}): Promise<{ url: string }> {
  const processed = await processAvatarBuffer(args.file.buffer)
  const key = `${args.keyPrefix}/${randomUUID()}.webp`
  const storage = getImageStorage()
  return storage.put({ key, body: processed, contentType: 'image/webp' })
}

/**
 * Best-effort key derivation from a stored URL. Works whenever the URL still
 * begins with the `keyRoot` we wrote (`avatars/…` / `gyms/…`); if the URL
 * has been rewritten through a different CDN base we just return null and
 * the orphan stays in S3.
 */
export function deriveKeyFromUrl(url: string, keyRoot: string): string | null {
  const idx = url.indexOf(`${keyRoot}/`)
  if (idx === -1) return null
  return url.slice(idx)
}
