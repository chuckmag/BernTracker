import { prisma } from '@wodalytics/db'
import { createLogger } from '@wodalytics/server'

const log = createLogger('mcp-tool')

export function resolveUserId(ctxUserId?: string, toolName?: string): string | undefined {
  const userId = ctxUserId ?? process.env.WODALYTICS_USER_ID
  const source = ctxUserId ? 'jwt' : process.env.WODALYTICS_USER_ID ? 'env' : 'none'
  if (toolName) {
    log.info(`${toolName}: userId=${userId ?? '(none)'} source=${source}`)
  }
  return userId
}

export function mcpUnauthorized() {
  return {
    content: [{ type: 'text' as const, text: 'Unauthorized — no authenticated user' }],
    isError: true,
  }
}

export async function userGymIds(userId: string): Promise<string[]> {
  const rows = await prisma.userGym.findMany({ where: { userId }, select: { gymId: true } })
  return rows.map((r) => r.gymId)
}

export async function userProgramIds(userId: string): Promise<string[]> {
  const rows = await prisma.userProgram.findMany({ where: { userId }, select: { programId: true } })
  return rows.map((r) => r.programId)
}
