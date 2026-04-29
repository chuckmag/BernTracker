import { Router, type Request, type Response } from 'express'
import { prisma } from '@wodalytics/db'
import { requireAuth } from '../middleware/auth.js'
import { validateGymExists, requireGymWriteAccess } from '../middleware/gym.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import { getImageStorage } from '../lib/imageStorage.js'
import {
  imageUpload,
  imageUploadErrorHandler,
  processAndStoreImage,
  deriveKeyFromUrl,
} from '../lib/imageUploadMiddleware.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('gymLogo')

// Only OWNER and PROGRAMMER can change a gym's branding. COACH has gym
// write access for daily ops (workouts, members) but shouldn't rebrand the
// gym — that's an owner-level decision.
async function requireOwnerOrProgrammer(req: Request, res: Response, next: () => void) {
  const userId = req.user?.id
  const gymId = req.params.gymId as string
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const membership = await findGymMembershipByUserAndGym(userId, gymId)
  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'PROGRAMMER')) {
    log.warning(req, `requireOwnerOrProgrammer: ${req.method} ${req.path} — userId=${userId} role=${membership?.role ?? 'none'}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

const router = Router()

router.post(
  '/gyms/:gymId/logo',
  requireAuth,
  validateGymExists,
  requireGymWriteAccess,
  requireOwnerOrProgrammer,
  imageUpload.single('file'),
  uploadGymLogo,
  imageUploadErrorHandler,
)
router.delete(
  '/gyms/:gymId/logo',
  requireAuth,
  validateGymExists,
  requireGymWriteAccess,
  requireOwnerOrProgrammer,
  deleteGymLogo,
)

export default router

async function uploadGymLogo(req: Request, res: Response) {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file uploaded. Send a multipart/form-data request with field "file".' })
    return
  }
  const gymId = req.params.gymId as string

  let url: string
  try {
    ({ url } = await processAndStoreImage({ file, keyPrefix: `gyms/${gymId}` }))
  } catch (err) {
    log.warning(req, `gym logo processing failed — ${err instanceof Error ? err.message : err}`)
    res.status(400).json({ error: 'That image couldn\'t be processed — try a different file.' })
    return
  }

  await prisma.gym.update({ where: { id: gymId }, data: { logoUrl: url } })
  res.json({ logoUrl: url })
}

async function deleteGymLogo(req: Request, res: Response) {
  const gymId = req.params.gymId as string
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { logoUrl: true } })
  if (!gym?.logoUrl) {
    res.status(204).end()
    return
  }
  await prisma.gym.update({ where: { id: gymId }, data: { logoUrl: null } })

  const key = deriveKeyFromUrl(gym.logoUrl, 'gyms')
  if (key) {
    await getImageStorage().delete(key)
  }
  res.status(204).end()
}
