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
 *   - MEMBER → only programs they have a UserProgram row for, so members
 *     don't see programs they were never invited to
 *
 * Caller-vs-gym is checked by the route guard before this is called.
 */
export async function findProgramsAvailableToUserInGym(
  userId: string,
  gymId: string,
  isStaff: boolean,
) {
  if (isStaff) {
    return prisma.gymProgram.findMany({
      where: { gymId },
      orderBy: { createdAt: 'desc' },
      include: {
        program: { include: { _count: { select: { members: true, workouts: true } } } },
      },
    })
  }
  return prisma.gymProgram.findMany({
    where: {
      gymId,
      program: { members: { some: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      program: { include: { _count: { select: { members: true, workouts: true } } } },
    },
  })
}
