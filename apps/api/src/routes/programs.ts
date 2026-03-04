import { Router } from 'express'
import { prisma } from '@berntracker/db'

const router = Router()

// GET /api/gyms/:gymId/programs
router.get('/gyms/:gymId/programs', async (req, res) => {
  const gym = await prisma.gym.findUnique({ where: { id: req.params.gymId } })
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const gymPrograms = await prisma.gymProgram.findMany({
    where: { gymId: req.params.gymId },
    include: { program: true },
  })

  res.json(gymPrograms)
})

// POST /api/gyms/:gymId/programs
router.post('/gyms/:gymId/programs', async (req, res) => {
  const gymId = req.params.gymId
  const { name, description, startDate, endDate } = req.body as {
    name: string
    description?: string
    startDate: string
    endDate?: string
  }

  const gym = await prisma.gym.findUnique({ where: { id: gymId } })
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const program = await prisma.program.create({
    data: {
      name,
      description,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      gyms: { create: { gymId } },
    },
  })

  res.status(201).json({ program })
})

// POST /api/programs/:id/subscribe
router.post('/programs/:id/subscribe', async (req, res) => {
  const { userId } = req.body as { userId: string }
  const program = await prisma.program.findUnique({ where: { id: req.params.id } })
  if (!program) return res.status(404).json({ error: 'Program not found' })

  const userProgram = await prisma.userProgram.upsert({
    where: { userId_programId: { userId, programId: req.params.id } },
    update: {},
    create: { userId, programId: req.params.id },
  })

  res.status(201).json(userProgram)
})

// DELETE /api/programs/:id/subscribe
router.delete('/programs/:id/subscribe', async (req, res) => {
  const { userId } = req.body as { userId: string }
  await prisma.userProgram.delete({
    where: { userId_programId: { userId, programId: req.params.id } },
  })
  res.status(204).send()
})

export default router
