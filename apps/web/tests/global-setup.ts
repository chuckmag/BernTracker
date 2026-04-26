import { createRequire } from 'module'

// Purge stale test fixtures before the suite runs. Prior failed runs can leave
// orphaned User / Gym / Program / RefreshToken rows behind (afterAll hooks are
// skipped when describe.serial bails out early), and accumulated rows under
// these well-known prefixes drift the dev DB further with every reviewer run.
// See issue #101.
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = _require('@prisma/client') as any

const USER_EMAIL_PREFIXES = [
  'uat-',
  'prog-e2e-',
  'e2e-',
]
const GYM_SLUG_PREFIXES = [
  'uat-',
  'programs-e2e-',
  'e2e-',
  'gymctx-',
]

export default async function globalSetup() {
  const prisma = new PrismaClient()
  try {
    // Expired refresh tokens accumulate; clear them so /login isn't competing
    // with hundreds of stale rows on token-create.
    await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })

    const staleUsers = await prisma.user.findMany({
      where: { OR: USER_EMAIL_PREFIXES.map((p) => ({ email: { startsWith: p } })) },
      select: { id: true },
    })
    const staleUserIds = staleUsers.map((u: { id: string }) => u.id)

    if (staleUserIds.length > 0) {
      const staleResults = await prisma.result.findMany({
        where: { userId: { in: staleUserIds } },
        select: { id: true },
      })
      const resultIds = staleResults.map((r: { id: string }) => r.id)
      if (resultIds.length > 0) {
        await prisma.result.deleteMany({ where: { id: { in: resultIds } } })
      }
    }

    const staleGyms = await prisma.gym.findMany({
      where: { OR: GYM_SLUG_PREFIXES.map((p) => ({ slug: { startsWith: p } })) },
      select: { id: true },
    })
    const staleGymIds = staleGyms.map((g: { id: string }) => g.id)

    if (staleGymIds.length > 0) {
      const linkedPrograms = await prisma.gymProgram.findMany({
        where: { gymId: { in: staleGymIds } },
        select: { programId: true },
      })
      const programIds = linkedPrograms.map((p: { programId: string }) => p.programId)
      if (programIds.length > 0) {
        await prisma.workout.updateMany({
          where: { programId: { in: programIds } },
          data: { programId: null },
        })
        await prisma.workout.deleteMany({ where: { programId: { in: programIds } } })
        await prisma.program.deleteMany({ where: { id: { in: programIds } } })
      }
    }

    if (staleUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: staleUserIds } } })
    }
    if (staleGymIds.length > 0) {
      await prisma.gym.deleteMany({ where: { id: { in: staleGymIds } } })
    }
  } finally {
    await prisma.$disconnect()
  }
}
