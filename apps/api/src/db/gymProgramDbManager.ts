import { prisma } from '@berntracker/db'

export async function findProgramsWithDetailsByGymId(gymId: string) {
  return prisma.gymProgram.findMany({
    where: { gymId },
    include: { program: true },
  })
}

export async function createProgramAndLinkToGym(
  gymId: string,
  data: { name: string; description?: string; startDate: string; endDate?: string },
) {
  const program = await prisma.program.create({
    data: {
      name: data.name,
      description: data.description,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      gyms: { create: { gymId } },
    },
  })
  return { program }
}
