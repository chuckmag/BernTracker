import type { Role } from '@wodalytics/db'
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role }
      requestId: string
    }
  }
}
