import { prisma } from '@berntracker/db'

interface UpdateProgramData {
  name?: string
  description?: string | null
  startDate?: Date
  endDate?: Date | null
  coverColor?: string | null
}

export async function findProgramWithGymIds(id: string) {
  return prisma.program.findUnique({
    where: { id },
    include: { gyms: { select: { gymId: true } } },
  })
}

export async function updateProgramById(id: string, data: UpdateProgramData) {
  return prisma.program.update({ where: { id }, data })
}

export async function deleteProgramById(id: string) {
  return prisma.program.delete({ where: { id } })
}

interface EnsureProgramDefaults {
  startDate: Date
  description?: string
}

// Used by the CrossFit Mainsite ingest job: returns the public program it
// writes into, creating it on first run so the cron is self-bootstrapping.
// Looked up by exact name (Program has no slug column today — switch to slug
// if/when one is introduced).
export async function ensureProgramByName(name: string, defaults: EnsureProgramDefaults) {
  const existing = await prisma.program.findFirst({ where: { name } })
  if (existing) return existing
  return prisma.program.create({
    data: {
      name,
      startDate: defaults.startDate,
      description: defaults.description,
    },
  })
}
