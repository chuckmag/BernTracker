import { Router, type Request, type Response } from 'express'
import { prisma } from '@wodalytics/db'
import { requireAuth } from '../middleware/auth.js'
import { getImageStorage } from '../lib/imageStorage.js'
import {
  imageUpload,
  imageUploadErrorHandler,
  processAndStoreImage,
  deriveKeyFromUrl,
} from '../lib/imageUploadMiddleware.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('avatar')

const router = Router()

router.post('/users/me/avatar', requireAuth, imageUpload.single('file'), uploadMyAvatar, imageUploadErrorHandler)
router.delete('/users/me/avatar', requireAuth, deleteMyAvatar)

export default router

async function uploadMyAvatar(req: Request, res: Response) {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file uploaded. Send a multipart/form-data request with field "file".' })
    return
  }

  const userId = req.user!.id
  let url: string
  try {
    ({ url } = await processAndStoreImage({ file, keyPrefix: `avatars/${userId}` }))
  } catch (err) {
    log.warning(req, `avatar processing failed — ${err instanceof Error ? err.message : err}`)
    res.status(400).json({ error: 'That image couldn\'t be processed — try a different file.' })
    return
  }

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } })
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

  const key = deriveKeyFromUrl(user.avatarUrl, 'avatars')
  if (key) {
    await getImageStorage().delete(key)
  }
  res.status(204).end()
}
