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

// Default program first, then newest. The list endpoints + the sidebar
// picker rely on this so the default is visually pinned without callers
// having to re-sort.
const programOrder = [
  { isDefault: 'desc' as const },
  { createdAt: 'desc' as const },
]

export async function findProgramsWithDetailsByGymId(gymId: string) {
  return prisma.gymProgram.findMany({
    where: { gymId },
    orderBy: programOrder,
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
 * already vetted by the route guard. Default program first so it pins
 * to the top of Browse with the "Gym default" label.
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
    orderBy: programOrder,
    include: {
      program: { include: programCountSelect },
    },
  })
}

/**
 * Returns the gym's default program id, or null if none is set.
 * Used by `findProgramsAvailableToUserInGym` to surface the default
 * program for every gym member without writing UserProgram rows.
 */
export async function findDefaultProgramIdForGym(gymId: string): Promise<string | null> {
  const row = await prisma.gymProgram.findFirst({
    where: { gymId, isDefault: true },
    select: { programId: true },
  })
  return row?.programId ?? null
}

/**
 * Clears the default flag from any GymProgram rows pointing at this program.
 * Called when a program's visibility flips to PRIVATE — a default must be
 * PUBLIC, otherwise members see it in the picker but can't open it.
 */
export async function clearDefaultForProgram(programId: string): Promise<number> {
  const result = await prisma.gymProgram.updateMany({
    where: { programId, isDefault: true },
    data: { isDefault: false },
  })
  return result.count
}

export type SetDefaultResult =
  | { ok: true }
  | { ok: false; reason: 'program-not-in-gym' | 'program-private' }

/**
 * Marks `programId` as the gym's default in a single transaction:
 *   1. validate the program is linked to this gym
 *   2. validate the program's visibility = PUBLIC (a default must be
 *      discoverable so existing members can also browse/join it)
 *   3. clear any existing default for the gym
 *   4. set this row's isDefault = true
 *
 * The partial unique index (`GymProgram_gym_default_key`) is the belt to
 * this transaction's suspenders — the clear-and-set keeps the typical
 * OWNER flow smooth, and the index catches anyone who races us at the
 * DB layer.
 */
export async function setGymProgramDefault(gymId: string, programId: string): Promise<SetDefaultResult> {
  return prisma.$transaction(async (tx) => {
    const link = await tx.gymProgram.findUnique({
      where: { gymId_programId: { gymId, programId } },
      include: { program: { select: { visibility: true } } },
    })
    if (!link) return { ok: false, reason: 'program-not-in-gym' as const }
    if (link.program.visibility !== 'PUBLIC') return { ok: false, reason: 'program-private' as const }

    await tx.gymProgram.updateMany({
      where: { gymId, isDefault: true },
      data: { isDefault: false },
    })
    await tx.gymProgram.update({
      where: { gymId_programId: { gymId, programId } },
      data: { isDefault: true },
    })
    return { ok: true as const }
  })
}
