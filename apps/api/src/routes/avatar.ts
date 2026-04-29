import { Router, type Request, type Response, type NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { prisma } from '@wodalytics/db'
import { requireAuth } from '../middleware/auth.js'
import { getImageStorage } from '../lib/imageStorage.js'
import { processAvatarBuffer } from '../lib/imageProcessing.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('avatar')

// 20MB raw input cap. Sharp resizes the cropped image to 512×512 WebP for
// storage (typically <50KB), so the cap is generous to allow phone-camera
// originals through before the client cropper has a chance to downscale.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
// Server allowlist stays JPEG/PNG/WebP. The client converts HEIC → JPEG
// before upload (default sharp builds don't ship libheif, so server-side
// HEIC decoding would fail).
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const upload = multer({
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

const router = Router()

router.post('/users/me/avatar', requireAuth, upload.single('file'), uploadMyAvatar, multerErrorHandler)
router.delete('/users/me/avatar', requireAuth, deleteMyAvatar)

export default router

async function uploadMyAvatar(req: Request, res: Response) {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file uploaded. Send a multipart/form-data request with field "file".' })
    return
  }

  let processed: Buffer
  try {
    processed = await processAvatarBuffer(file.buffer)
  } catch (err) {
    log.warning(req, `avatar processing failed — ${err instanceof Error ? err.message : err}`)
    res.status(400).json({ error: 'That image couldn\'t be processed — try a different file.' })
    return
  }

  const userId = req.user!.id
  // Content-addressed-ish key: per-user prefix + random nonce. The nonce makes
  // the URL change on every upload so caches invalidate naturally without
  // having to set Cache-Control: no-cache.
  const key = `avatars/${userId}/${randomUUID()}.webp`

  const storage = getImageStorage()
  const { url } = await storage.put({ key, body: processed, contentType: 'image/webp' })

  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: url },
  })

  res.json({ avatarUrl: url })
}

async function deleteMyAvatar(req: Request, res: Response) {
  const userId = req.user!.id
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } })
  if (!user?.avatarUrl) {
    res.status(204).end()
    return
  }
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } })

  // Best-effort delete from storage. We derive the key from the URL by
  // dropping the public base — works for both backends since `put()` returns
  // `<base>/<key>`. If the URL was rewritten (e.g. via a CDN with a different
  // base), the file just stays orphaned; the User row no longer references it
  // so it's invisible to users.
  const key = deriveKeyFromUrl(user.avatarUrl)
  if (key) {
    const storage = getImageStorage()
    await storage.delete(key)
  }
  res.status(204).end()
}

function deriveKeyFromUrl(url: string): string | null {
  // Strip protocol + host + leading slash.
  const idx = url.indexOf('avatars/')
  if (idx === -1) return null
  return url.slice(idx)
}

// Multer's error handling differs from Express's — both LIMIT_FILE_SIZE and
// fileFilter rejections throw BEFORE the route handler runs. Surface friendly
// 4xx codes for both classes; only fall through to the global handler for
// genuinely unexpected errors.
function multerErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).` })
      return
    }
    res.status(400).json({ error: err.message })
    return
  }
  // fileFilter rejections come through as plain Error.
  if (err instanceof Error && err.message.startsWith('Unsupported image type:')) {
    res.status(400).json({ error: err.message })
    return
  }
  next(err)
}
