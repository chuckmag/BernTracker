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

// Used by the CrossFit Mainsite ingest job to find the public program it
// writes into. Looked up by exact name (Program has no slug column today —
// switch to slug if/when one is introduced).
export async function findProgramByName(name: string) {
  return prisma.program.findFirst({ where: { name } })
}

export type ProgramGymAccessResult = 'ok' | 'not-found' | 'forbidden'

// Verify the program exists, is linked to the given gym, and the caller is a
// member of that gym. Used by the workouts list endpoint when a `?programId`
// query param is present (route-level `requireGymMembership` already vetted
// caller-vs-gym; this helper just ties program-vs-gym into the picture).
//
// Slice 2 deliberately does not enforce visibility (PUBLIC vs PRIVATE) — that
// arrives in slice 4 (#87) and tightens this same check.
export async function findProgramGymAccessForUser(
  programId: string,
  gymId: string,
): Promise<ProgramGymAccessResult> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { gyms: { where: { gymId }, select: { gymId: true } } },
  })
  if (!program) return 'not-found'
  if (program.gyms.length === 0) return 'forbidden'
  return 'ok'
}
