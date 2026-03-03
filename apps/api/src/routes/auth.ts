import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '@berntracker/db'
import { LoginSchema, RegisterSchema } from '@berntracker/types'
import { signTokenPair, verifyRefreshToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

// POST /register
router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { email, password, name } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Email already in use' })
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
    select: { id: true, email: true, name: true, role: true },
  })

  const { accessToken, refreshToken } = signTokenPair(user.id, user.role)
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
  res.status(201).json({ accessToken, user })
})

// POST /login
router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  // Always compare to avoid email enumeration timing attacks
  const hash = user?.passwordHash ?? '$2a$10$invalidhashpaddingtomatchbcryptlength00000000000000000'
  const valid = await bcrypt.compare(password, hash)

  if (!user || !valid) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const { accessToken, refreshToken } = signTokenPair(user.id, user.role)
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
  res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
})

// POST /refresh
router.post('/refresh', async (req, res) => {
  const token: string | undefined = req.cookies.refreshToken
  if (!token) {
    res.status(401).json({ error: 'No refresh token' })
    return
  }

  let payload: { sub: string; role: Parameters<typeof signTokenPair>[1] }
  try {
    payload = verifyRefreshToken(token) as typeof payload
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
    return
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } })
  if (!stored) {
    res.status(401).json({ error: 'Refresh token not found or already used' })
    return
  }

  await prisma.refreshToken.delete({ where: { token } })

  const { accessToken, refreshToken: newRefresh } = signTokenPair(payload.sub, payload.role)
  await prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      token: newRefresh,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  res.cookie('refreshToken', newRefresh, COOKIE_OPTIONS)
  res.json({ accessToken })
})

// POST /logout
router.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies.refreshToken
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } })
  }
  res.clearCookie('refreshToken')
  res.sendStatus(204)
})

// GET /me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(user)
})

// Google OAuth stubs
router.get('/google', (_req, res) => { res.sendStatus(501) })
router.get('/google/callback', (_req, res) => { res.sendStatus(501) })
router.post('/google/mobile', (_req, res) => { res.sendStatus(501) })

export { router as authRouter }
