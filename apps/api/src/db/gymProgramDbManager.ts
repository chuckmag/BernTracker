import { prisma, type ProgramVisibility } from '@wodalytics/db'

interface CreateProgramData {
  name: string
  description?: string
  startDate: string | Date
  endDate?: string | Date
  coverColor?: string
  visibility?: ProgramVisibility
}

const programCountSelect = {
  _count: { select: { members: true, workouts: true } },
} as const

export async function findProgramsWithDetailsByGymId(gymId: string) {
  return prisma.gymProgram.findMany({
    where: { gymId },
    orderBy: { createdAt: 'desc' },
    include: {
      program: { include: programCountSelect },
    },
  })
}

export async function findProgramWithDetailsByIdAndGymId(programId: string, gymId: string) {
  return prisma.gymProgram.findUnique({
    where: { gymId_programId: { gymId, programId } },
    include: {
      program: { include: programCountSelect },
    },
  })
}

export async function createProgramAndLinkToGym(gymId: string, data: CreateProgramData) {
  const program = await prisma.program.create({
    data: {
      name: data.name,
      description: data.description,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      coverColor: data.coverColor,
      visibility: data.visibility,
      gyms: { create: { gymId } },
    },
    include: programCountSelect,
  })
  return { program }
}

/**
 * Lists PUBLIC programs in the gym that the caller has NOT yet joined.
 * Drives the Browse page (slice 4 / #87). Caller's gym membership is
 * already vetted by the route guard.
 */
export async function findBrowseProgramsForGymAndUser(gymId: string, userId: string) {
  return prisma.gymProgram.findMany({
    where: {
      gymId,
      program: {
        visibility: 'PUBLIC',
        // Exclude programs the caller is already a member of.
        members: { none: { userId } },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      program: { include: programCountSelect },
    },
  })
}
