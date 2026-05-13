import { prisma } from '@wodalytics/db'

export function resolveUserId(ctxUserId?: string): string | undefined {
  return ctxUserId ?? process.env.WODALYTICS_USER_ID
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
