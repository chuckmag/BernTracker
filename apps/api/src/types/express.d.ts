import type { Role } from '@berntracker/db'
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role }
      requestId: string
    }
  }
}
