import { Router } from 'express'
import { findGymById } from '../db/gymDbManager.js'
import { findProgramsWithDetailsByGymId, createProgramAndLinkToGym } from '../db/gymProgramDbManager.js'
import { findProgramById, subscribeUserToProgram, unsubscribeUserFromProgram } from '../db/userProgramDbManager.js'

const router = Router()

// GET /api/gyms/:gymId/programs
router.get('/gyms/:gymId/programs', async (req, res) => {
  const gym = await findGymById(req.params.gymId)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const gymPrograms = await findProgramsWithDetailsByGymId(req.params.gymId)
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

  const gym = await findGymById(gymId)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const result = await createProgramAndLinkToGym(gymId, { name, description, startDate, endDate })
  res.status(201).json(result)
})

// POST /api/programs/:id/subscribe
router.post('/programs/:id/subscribe', async (req, res) => {
  const { userId } = req.body as { userId: string }
  const program = await findProgramById(req.params.id)
  if (!program) return res.status(404).json({ error: 'Program not found' })

  const userProgram = await subscribeUserToProgram(userId, req.params.id)
  res.status(201).json(userProgram)
})

// DELETE /api/programs/:id/subscribe
router.delete('/programs/:id/subscribe', async (req, res) => {
  const { userId } = req.body as { userId: string }
  await unsubscribeUserFromProgram(userId, req.params.id)
  res.status(204).send()
})

export default router
