import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  createGymAndAddOwnerMember,
  findGymById,
  updateGymNameAndTimezone,
} from '../db/gymDbManager.js'
import {
  findMembersWithProgramSubscriptionsByGymId,
  inviteUserToGymByEmail,
  updateGymMemberRole,
  removeGymMember,
} from '../db/userGymDbManager.js'

const router = Router()

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

// POST /api/gyms
router.post('/gyms', requireAuth, async (req, res) => {
  const { name, timezone } = req.body as { name: string; timezone?: string }
  const gym = await createGymAndAddOwnerMember({ name, slug: slugify(name), timezone }, req.user!.id)
  res.status(201).json(gym)
})

// GET /api/gyms/:id
router.get('/gyms/:id', async (req, res) => {
  const gym = await findGymById(req.params.id)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })
  res.json(gym)
})

// PATCH /api/gyms/:id
router.patch('/gyms/:id', async (req, res) => {
  const { name, timezone } = req.body as { name?: string; timezone?: string }
  const gym = await updateGymNameAndTimezone(req.params.id, { name, timezone })
  res.json(gym)
})

// GET /api/gyms/:gymId/members
router.get('/gyms/:gymId/members', async (req, res) => {
  const gym = await findGymById(req.params.gymId)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const members = await findMembersWithProgramSubscriptionsByGymId(req.params.gymId)
  res.json(members)
})

// POST /api/gyms/:gymId/members/invite
router.post('/gyms/:gymId/members/invite', async (req, res) => {
  const { email, role } = req.body as { email: string; role?: string }
  const gymId = req.params.gymId

  if (!email) return res.status(400).json({ error: 'email is required' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' })

  const gym = await findGymById(gymId)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const userRole = (role as 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER') ?? 'MEMBER'
  const result = await inviteUserToGymByEmail(email, gymId, userRole)
  res.status(201).json(result)
})

// PATCH /api/gyms/:gymId/members/:userId
router.patch('/gyms/:gymId/members/:userId', async (req, res) => {
  const { role } = req.body as { role: 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER' }
  const membership = await updateGymMemberRole(req.params.userId, req.params.gymId, role)
  res.json(membership)
})

// DELETE /api/gyms/:gymId/members/:userId
router.delete('/gyms/:gymId/members/:userId', async (req, res) => {
  await removeGymMember(req.params.userId, req.params.gymId)
  res.status(204).send()
})

export default router
