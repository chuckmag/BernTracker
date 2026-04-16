import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { prisma } from '@berntracker/db'
import { authRouter } from './routes/auth.js'
import gymsRouter from './routes/gyms'
import programsRouter from './routes/programs'
import workoutsRouter from './routes/workouts'
import resultsRouter from './routes/results'
import namedWorkoutsRouter from './routes/namedWorkouts'
import { createLogger, Log } from './lib/logger.js'

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
app.use('/api', workoutsRouter)
app.use('/api', resultsRouter)
app.use('/api', namedWorkoutsRouter)

const logError = createLogger('error')

// Global error handler — catches any unhandled exception thrown from route handlers or middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err)
  logError(Log.ERROR, req, `${req.method} ${req.path} — ${message}`, err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})
