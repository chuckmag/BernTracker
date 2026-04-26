import { prisma } from '@wodalytics/db'

interface CreateProgramData {
  name: string
  description?: string
  startDate: string | Date
  endDate?: string | Date
  coverColor?: string
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
      gyms: { create: { gymId } },
    },
    include: programCountSelect,
  })
  return { program }
}
