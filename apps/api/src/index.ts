import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { prisma } from '@berntracker/db'
import { authRouter } from './routes/auth.js'
import gymsRouter from './routes/gyms'
import programsRouter from './routes/programs'
import resultsRouter from './routes/results'

const app = express()
const port = process.env.PORT ?? 3000

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'ok', timestamp: new Date() })
})

app.use('/api', gymsRouter)
app.use('/api', programsRouter)
app.use('/api', resultsRouter)

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})
