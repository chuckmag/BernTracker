import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '@wodalytics/db'
import { LoginSchema, RegisterSchema } from '@wodalytics/types'
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

// Cross-origin setup on hosted environments (Railway gives each service its own
// subdomain — see #77). SameSite=None is required for the web to receive the
// cookie after the cross-site auth call, and browsers reject None without Secure.
const IS_LOCAL_DEV = process.env.NODE_ENV === 'development'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: !IS_LOCAL_DEV,
  sameSite: (IS_LOCAL_DEV ? 'lax' : 'none') as 'lax' | 'none',
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
  res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, identifiedGender: user.identifiedGender } })
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
    select: { id: true, email: true, name: true, role: true, identifiedGender: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({
    ...user,
    isMovementReviewer: user.email === (process.env.MOVEMENT_REVIEWER_EMAIL ?? ''),
  })
})

// GET /google — redirect to Google consent screen.
// Optional query params:
//   - mobile_redirect=<scheme://...>: when present (mobile clients) the callback
//     redirects to that scheme with tokens as query params instead of the web
//     frontend. State carries it through the OAuth round-trip (also CSRF protection).
//   - prompt=<select_account|...>: forwarded to Google so the sign-up flow can
//     force the account picker instead of silently reusing the last session.
router.get('/google', (req, res) => {
  const mobileRedirect = req.query.mobile_redirect as string | undefined
  const prompt = typeof req.query.prompt === 'string' ? req.query.prompt : undefined
  const url = googleClient().generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state: mobileRedirect ? JSON.stringify({ mobileRedirect }) : undefined,
    ...(prompt ? { prompt } : {}),
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

  // Recover mobile_redirect from state if present
  let mobileRedirect: string | undefined
  const stateStr = req.query.state as string | undefined
  if (stateStr) {
    try { mobileRedirect = JSON.parse(stateStr).mobileRedirect } catch {}
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

  if (mobileRedirect) {
    // Mobile flow: redirect to the app scheme with tokens as query params so
    // WebBrowser.openAuthSessionAsync can intercept and return them to the app.
    // Google only ever sees http://localhost:3000/api/auth/google/callback —
    // the exp:// or app scheme redirect is entirely server→app, not Google→app.
    const params = new URLSearchParams({ token: accessToken, refreshToken })
    res.redirect(`${mobileRedirect}?${params}`)
  } else {
    // Web flow: silent refresh picks up the cookie and issues accessToken
    res.redirect(`${FRONTEND_URL}/dashboard`)
  }
})

// POST /google/mobile — verify Google ID token from Expo, issue JWT pair
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

  // refreshToken returned in body (not just cookie) so mobile clients can
  // persist it in SecureStore — mobile fetch doesn't use httpOnly cookies.
  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
  res.json({ accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, identifiedGender: user.identifiedGender } })
})

async function findOrCreateGoogleUser(googleId: string, email: string, name: string) {
  // Check for existing OAuth account
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: 'google', providerId: googleId } },
    include: { user: { select: { id: true, email: true, name: true, role: true, identifiedGender: true } } },
  })
  if (existing) return existing.user

  // Try to link to an existing email user
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    await prisma.oAuthAccount.create({
      data: { userId: existingUser.id, provider: 'google', providerId: googleId },
    })
    return { id: existingUser.id, email: existingUser.email, name: existingUser.name, role: existingUser.role, identifiedGender: existingUser.identifiedGender }
  }

  // Create new user + OAuthAccount
  const user = await prisma.user.create({
    data: {
      email,
      name,
      oauthAccounts: { create: { provider: 'google', providerId: googleId } },
    },
    select: { id: true, email: true, name: true, role: true, identifiedGender: true },
  })
  return user
}

export { router as authRouter }
