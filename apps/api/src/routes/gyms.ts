import { Router } from 'express'
import { prisma, type Prisma } from '@berntracker/db'
import { requireAuth } from '../middleware/auth.js'

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
  const slug = slugify(name)
  const gym = await prisma.$transaction(async (tx) => {
    const created = await tx.gym.create({
      data: { name, slug, ...(timezone ? { timezone } : {}) },
    })
    await tx.userGym.create({
      data: { userId: req.user!.id, gymId: created.id, role: 'OWNER' },
    })
    return created
  })
  res.status(201).json(gym)
})

// GET /api/gyms/:id
router.get('/gyms/:id', async (req, res) => {
  const gym = await prisma.gym.findUnique({ where: { id: req.params.id } })
  if (!gym) return res.status(404).json({ error: 'Gym not found' })
  res.json(gym)
})

// PATCH /api/gyms/:id
router.patch('/gyms/:id', async (req, res) => {
  const { name, timezone } = req.body as { name?: string; timezone?: string }
  const gym = await prisma.gym.update({
    where: { id: req.params.id },
    data: { ...(name ? { name } : {}), ...(timezone ? { timezone } : {}) },
  })
  res.json(gym)
})

// GET /api/gyms/:gymId/members
router.get('/gyms/:gymId/members', async (req, res) => {
  const gym = await prisma.gym.findUnique({ where: { id: req.params.gymId } })
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const memberships = await prisma.userGym.findMany({
    where: { gymId: req.params.gymId },
    include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
  })

  const members = memberships.map((m) => ({
    id: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    joinedAt: m.joinedAt,
  }))

  res.json(members)
})

// POST /api/gyms/:gymId/members/invite
router.post('/gyms/:gymId/members/invite', async (req, res) => {
  const { email, role } = req.body as { email: string; role?: string }
  const gymId = req.params.gymId

  if (!email) return res.status(400).json({ error: 'email is required' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' })

  const gym = await prisma.gym.findUnique({ where: { id: gymId } })
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const userRole = (role as 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER') ?? 'MEMBER'

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let user = await tx.user.findUnique({ where: { email } })
    if (!user) {
      user = await tx.user.create({ data: { email } })
    }
    const membership = await tx.userGym.upsert({
      where: { userId_gymId: { userId: user.id, gymId } },
      update: { role: userRole },
      create: { userId: user.id, gymId, role: userRole },
    })
    return { id: user.id, email: user.email, name: user.name, role: membership.role, joinedAt: membership.joinedAt }
  })

  res.status(201).json(result)
})

// PATCH /api/gyms/:gymId/members/:userId
router.patch('/gyms/:gymId/members/:userId', async (req, res) => {
  const { role } = req.body as { role: 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER' }
  const membership = await prisma.userGym.update({
    where: { userId_gymId: { userId: req.params.userId, gymId: req.params.gymId } },
    data: { role },
  })
  res.json(membership)
})

// DELETE /api/gyms/:gymId/members/:userId
router.delete('/gyms/:gymId/members/:userId', async (req, res) => {
  await prisma.userGym.delete({
    where: { userId_gymId: { userId: req.params.userId, gymId: req.params.gymId } },
  })
  res.status(204).send()
})

export default router
