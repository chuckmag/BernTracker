import jwt from 'jsonwebtoken'
import type { Role } from '@wodalytics/db'

const ACCESS_EXPIRY = '15m'
const REFRESH_EXPIRY = '7d'

function secret(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, secret('JWT_SECRET'), { expiresIn: ACCESS_EXPIRY })
}

export function signRefreshToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, secret('JWT_REFRESH_SECRET'), { expiresIn: REFRESH_EXPIRY })
}

export function signTokenPair(userId: string, role: Role) {
  return {
    accessToken: signAccessToken(userId, role),
    refreshToken: signRefreshToken(userId, role),
  }
}

export function verifyAccessToken(token: string): { sub: string; role: Role } {
  const payload = jwt.verify(token, secret('JWT_SECRET')) as { sub: string; role: Role }
  return { sub: payload.sub, role: payload.role }
}

export function verifyRefreshToken(token: string): { sub: string; role: Role } {
  const payload = jwt.verify(token, secret('JWT_REFRESH_SECRET')) as { sub: string; role: Role }
  return { sub: payload.sub, role: payload.role }
}
