import { prisma, ProgramRole } from '@wodalytics/db'

export async function findProgramById(id: string) {
  return prisma.program.findUnique({ where: { id } })
}

export async function subscribeUserToProgram(
  userId: string,
  programId: string,
  role: ProgramRole = ProgramRole.MEMBER,
) {
  return prisma.userProgram.upsert({
    where: { userId_programId: { userId, programId } },
    update: { role },
    create: { userId, programId, role },
  })
}

/**
 * Insert a UserProgram row, refusing to overwrite an existing subscription.
 * The slice-3 invite endpoint uses this so a duplicate POST surfaces as 409
 * to the UI; the legacy upsert helper above is still available for callers
 * (e.g. the auto-subscribe hook in slice 5) that want idempotent semantics.
 */
export async function createUserProgramSubscription(
  userId: string,
  programId: string,
  role: ProgramRole = ProgramRole.MEMBER,
) {
  return prisma.userProgram.create({ data: { userId, programId, role } })
}

export async function findUserProgramMembership(userId: string, programId: string) {
  return prisma.userProgram.findUnique({
    where: { userId_programId: { userId, programId } },
    select: { role: true },
  })
}

export async function unsubscribeUserFromProgram(userId: string, programId: string) {
  return prisma.userProgram.delete({
    where: { userId_programId: { userId, programId } },
  })
}

const programMemberUserSelect = {
  id: true,
  email: true,
  name: true,
} as const

/** Lists all subscribers of a program with the user info the Members tab renders. */
export async function findProgramMembersWithUserInfo(programId: string) {
  return prisma.userProgram.findMany({
    where: { programId },
    orderBy: { joinedAt: 'asc' },
    select: {
      role: true,
      joinedAt: true,
      user: { select: programMemberUserSelect },
    },
  })
}

/**
 * Returns the GymProgram rows for programs the caller can see in this gym.
 *
 * Two roles, two answers:
 *   - Staff (OWNER / PROGRAMMER / COACH) → all programs linked to the gym
 *     so they can pick any program in their picker
 *   - MEMBER → programs they have a UserProgram row for, **plus** the gym's
 *     default program (if any). The default surfaces for every gym member
 *     without needing a UserProgram row, so onboarding doesn't depend on a
 *     write-side hook (slice 5 / #88).
 *
 * Caller-vs-gym is checked by the route guard before this is called.
 * Default program is sorted first so the picker pins it visually.
 */
export async function findProgramsAvailableToUserInGym(
  userId: string,
  gymId: string,
  isStaff: boolean,
) {
  if (isStaff) {
    return prisma.gymProgram.findMany({
      where: { gymId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: {
        program: { include: { _count: { select: { members: true, workouts: true } } } },
      },
    })
  }
  return prisma.gymProgram.findMany({
    where: {
      gymId,
      OR: [
        // Programs the member has a real UserProgram subscription for…
        { program: { members: { some: { userId } } } },
        // …plus whichever program is marked default for this gym.
        { isDefault: true },
      ],
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    include: {
      program: { include: { _count: { select: { members: true, workouts: true } } } },
    },
  })
}
