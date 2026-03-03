import express from 'express'
import { prisma } from '@berntracker/db'

const app = express()
const port = process.env.PORT ?? 3000

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'ok', timestamp: new Date() })
})

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})
