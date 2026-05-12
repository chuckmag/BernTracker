import type { Role } from '@wodalytics/db'

declare global {
  namespace Express {
    interface Request {
      requestId?: string
      user?: { id: string; role?: Role }
    }
  }
}

export {}
