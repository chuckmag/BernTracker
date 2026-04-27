import { Router, type Request, type Response } from 'express'
import {
  UpdateProfileSchema,
  CreateEmergencyContactSchema,
  UpdateEmergencyContactSchema,
} from '@wodalytics/types'
import { requireAuth } from '../middleware/auth.js'
import {
  findUserProfileById,
  updateUserProfileById,
  maybeMarkOnboarded,
} from '../db/userProfileDbManager.js'
import {
  findEmergencyContactsByUserId,
  findEmergencyContactByIdAndUserId,
  createEmergencyContactForUser,
  updateEmergencyContactByIdAndUserId,
  deleteEmergencyContactByIdAndUserId,
} from '../db/emergencyContactDbManager.js'

const router = Router()

router.get('/users/me/profile', requireAuth, getMyProfile)
router.patch('/users/me/profile', requireAuth, patchMyProfile)
router.get('/users/me/emergency-contacts', requireAuth, listMyEmergencyContacts)
router.post('/users/me/emergency-contacts', requireAuth, createMyEmergencyContact)
router.patch('/users/me/emergency-contacts/:id', requireAuth, patchMyEmergencyContact)
router.delete('/users/me/emergency-contacts/:id', requireAuth, deleteMyEmergencyContact)

export default router

async function getMyProfile(req: Request, res: Response) {
  const userId = req.user!.id
  const [profile, contacts] = await Promise.all([
    findUserProfileById(userId),
    findEmergencyContactsByUserId(userId),
  ])
  if (!profile) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ ...profile, emergencyContacts: contacts })
}

async function patchMyProfile(req: Request, res: Response) {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const userId = req.user!.id
  const data: Parameters<typeof updateUserProfileById>[1] = {}
  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName
  if (parsed.data.birthday !== undefined) {
    data.birthday = parsed.data.birthday === null ? null : new Date(`${parsed.data.birthday}T00:00:00Z`)
  }
  if (parsed.data.identifiedGender !== undefined) data.identifiedGender = parsed.data.identifiedGender

  await updateUserProfileById(userId, data)
  await maybeMarkOnboarded(userId)
  const [profile, contacts] = await Promise.all([
    findUserProfileById(userId),
    findEmergencyContactsByUserId(userId),
  ])
  res.json({ ...profile, emergencyContacts: contacts })
}

async function listMyEmergencyContacts(req: Request, res: Response) {
  const contacts = await findEmergencyContactsByUserId(req.user!.id)
  res.json(contacts)
}

async function createMyEmergencyContact(req: Request, res: Response) {
  const parsed = CreateEmergencyContactSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const userId = req.user!.id
  const contact = await createEmergencyContactForUser(userId, parsed.data)
  await maybeMarkOnboarded(userId)
  res.status(201).json(contact)
}

async function patchMyEmergencyContact(req: Request, res: Response) {
  const parsed = UpdateEmergencyContactSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const updated = await updateEmergencyContactByIdAndUserId(
    req.params.id as string,
    req.user!.id,
    parsed.data,
  )
  if (!updated) {
    res.status(404).json({ error: 'Emergency contact not found' })
    return
  }
  res.json(updated)
}

async function deleteMyEmergencyContact(req: Request, res: Response) {
  const userId = req.user!.id
  // Block deleting the last contact for an onboarded user — onboardedAt requires ≥1 contact.
  const existing = await findEmergencyContactByIdAndUserId(req.params.id as string, userId)
  if (!existing) {
    res.status(404).json({ error: 'Emergency contact not found' })
    return
  }
  const all = await findEmergencyContactsByUserId(userId)
  if (all.length === 1) {
    const profile = await findUserProfileById(userId)
    if (profile?.onboardedAt) {
      res.status(409).json({ error: 'Cannot delete your only emergency contact. Add another first.' })
      return
    }
  }
  const deleted = await deleteEmergencyContactByIdAndUserId(req.params.id as string, userId)
  if (!deleted) {
    res.status(404).json({ error: 'Emergency contact not found' })
    return
  }
  res.status(204).end()
}
