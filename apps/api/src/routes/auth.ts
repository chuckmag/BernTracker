import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '@berntracker/db'
import { LoginSchema, RegisterSchema } from '@berntracker/types'
import { signTokenPair, verifyRefreshToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/auth.js'

function googleClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback',
  )
}

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

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

  const { count } = await prisma.refreshToken.deleteMany({ where: { token } })
  if (count === 0) {
    res.status(401).json({ error: 'Refresh token not found or already used' })
    return
  }

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

// GET /google — redirect to Google consent screen
router.get('/google', (_req, res) => {
  const url = googleClient().generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
  })
  res.redirect(url)
})

// GET /google/callback — exchange code, findOrCreate user, issue tokens
router.get('/google/callback', async (req, res) => {
  const code = req.query.code as string | undefined
  if (!code) {
    res.status(400).json({ error: 'Missing code' })
    return
  }

  let googleId: string, email: string, name: string
  try {
    const client = googleClient()
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()!
    googleId = payload.sub
    email = payload.email!
    name = payload.name ?? email
  } catch {
    res.status(401).json({ error: 'Google token verification failed' })
    return
  }

  const user = await findOrCreateGoogleUser(googleId, email, name)
  const { accessToken, refreshToken } = signTokenPair(user.id, user.role)
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
  // Redirect to frontend — silent refresh will pick up the cookie and issue accessToken
  res.redirect(`${FRONTEND_URL}/dashboard`)
})

// POST /google/mobile — verify Google ID token from Expo, issue JWT pair
// TODO: This is untested and should be seen as stubbed out for now.
router.post('/google/mobile', async (req, res) => {
  const { idToken } = req.body as { idToken?: string }
  if (!idToken) {
    res.status(400).json({ error: 'Missing idToken' })
    return
  }

  let googleId: string, email: string, name: string
  try {
    const ticket = await googleClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()!
    googleId = payload.sub
    email = payload.email!
    name = payload.name ?? email
  } catch {
    res.status(401).json({ error: 'Google token verification failed' })
    return
  }

  const user = await findOrCreateGoogleUser(googleId, email, name)
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

async function findOrCreateGoogleUser(googleId: string, email: string, name: string) {
  // Check for existing OAuth account
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: 'google', providerId: googleId } },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  })
  if (existing) return existing.user

  // Try to link to an existing email user
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    await prisma.oAuthAccount.create({
      data: { userId: existingUser.id, provider: 'google', providerId: googleId },
    })
    return { id: existingUser.id, email: existingUser.email, name: existingUser.name, role: existingUser.role }
  }

  // Create new user + OAuthAccount
  const user = await prisma.user.create({
    data: {
      email,
      name,
      oauthAccounts: { create: { provider: 'google', providerId: googleId } },
    },
    select: { id: true, email: true, name: true, role: true },
  })
  return user
}

export { router as authRouter }
