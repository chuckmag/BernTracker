import { prisma, ProgramRole, Prisma, type ProgramVisibility } from '@wodalytics/db'

interface UpdateProgramData {
  name?: string
  description?: string | null
  startDate?: Date
  endDate?: Date | null
  coverColor?: string | null
  visibility?: ProgramVisibility
}

export async function findProgramWithGymIds(id: string) {
  return prisma.program.findUnique({
    where: { id },
    include: { gyms: { select: { gymId: true } } },
  })
}

/**
 * Returns true if any GymProgram row for this program has isDefault=true.
 * Used by the visibility-PATCH guard — making a default program PRIVATE
 * would orphan it for non-staff members, so we refuse the flip and tell
 * the user to clear the default first (slice 5 / #88).
 */
export async function isProgramDefaultForAnyGym(programId: string): Promise<boolean> {
  const row = await prisma.gymProgram.findFirst({
    where: { programId, isDefault: true },
    select: { gymId: true },
  })
  return Boolean(row)
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

// Used by the CrossFit Mainsite ingest job to bootstrap the public program on
// first run. Program.startDate is required by the schema; defaults to today
// since the program tracks daily WODs going forward from creation.
// Visibility defaults to PUBLIC so the program shows up in the public-catalog
// browse endpoint — gym-less programs are only useful when discoverable.
export async function createProgramByName(name: string, startDate: Date = new Date()) {
  return prisma.program.create({ data: { name, startDate, visibility: 'PUBLIC' } })
}

// Used by the CrossFit Mainsite ingest job to repair the visibility flag for
// pre-existing rows that were created before the default flipped to PUBLIC.
// Safe no-op once the row is already PUBLIC.
export async function ensureProgramIsPublic(programId: string) {
  await prisma.program.update({
    where: { id: programId },
    data: { visibility: 'PUBLIC' },
  })
}

/**
 * Lists PUBLIC programs that are NOT linked to any gym (e.g. the CrossFit
 * Mainsite WOD program created by the ingest job) and that the caller has
 * not already subscribed to. Drives the "Public programs" section of the
 * Browse page.
 *
 * No gym scoping — these programs exist outside the per-gym catalog. The
 * caller-vs-program access check is intentionally just "must be authenticated"
 * because the programs are public by definition.
 */
export async function findUnaffiliatedPublicProgramsForUser(userId: string) {
  return prisma.program.findMany({
    where: {
      visibility: 'PUBLIC',
      gyms: { none: {} },
      members: { none: { userId } },
    },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true, workouts: true } } },
  })
}

// ─── Personal Program (#183) ──────────────────────────────────────────────────

const personalProgramInclude = {
  _count: { select: { workouts: true } },
} as const

export type PersonalProgramRow = Prisma.ProgramGetPayload<{
  include: typeof personalProgramInclude
}>

/**
 * Returns the caller's personal program, creating it on first call. Idempotent:
 * subsequent calls return the existing row. The unique constraint on
 * `Program.ownerUserId` makes the create race-safe — concurrent first-time
 * callers collapse to a single row, the loser gets P2002 and we re-fetch.
 *
 * Personal programs are PRIVATE, never linked to a Gym, and the owner is
 * auto-subscribed as PROGRAMMER so the existing workout middleware grants
 * read+write on workouts under the program (see middleware/workout.ts).
 */
export async function findOrCreatePersonalProgramForUser(userId: string): Promise<PersonalProgramRow> {
  const existing = await prisma.program.findUnique({
    where: { ownerUserId: userId },
    include: personalProgramInclude,
  })
  if (existing) return existing

  try {
    return await prisma.$transaction(async (tx) => {
      const program = await tx.program.create({
        data: {
          name: 'Personal Program',
          ownerUserId: userId,
          startDate: new Date(),
          visibility: 'PRIVATE',
        },
      })
      await tx.userProgram.create({
        data: { userId, programId: program.id, role: ProgramRole.PROGRAMMER },
      })
      return tx.program.findUniqueOrThrow({
        where: { id: program.id },
        include: personalProgramInclude,
      })
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const racedRow = await prisma.program.findUnique({
        where: { ownerUserId: userId },
        include: personalProgramInclude,
      })
      if (racedRow) return racedRow
    }
    throw err
  }
}

export type ProgramGymAccessResult = 'ok' | 'not-found' | 'forbidden'

/**
 * Visibility-aware access check for the workouts list endpoint
 * (`GET /workouts?programIds=…`).
 *
 *   - Gym-affiliated programs:
 *       - Program must be linked to the gym (program-vs-gym vetting).
 *       - PUBLIC: visible to every gym member.
 *       - PRIVATE: staff in any linked gym OR a UserProgram subscriber.
 *   - Unaffiliated programs (no `GymProgram` rows — e.g. CrossFit Mainsite):
 *       - Caller must have a `UserProgram` subscription. Visibility is
 *         irrelevant here because there's no gym whose membership we could
 *         lean on; the subscription is the only access signal.
 *
 * Caller-vs-gym is checked by the route guard before this is called.
 */
export async function findProgramGymAccessForUser(
  programId: string,
  gymId: string,
  userId: string,
  callerGymRole: string,
): Promise<ProgramGymAccessResult> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: {
      visibility: true,
      gyms: { select: { gymId: true } },
    },
  })
  if (!program) return 'not-found'

  const linkedGymIds = program.gyms.map((g) => g.gymId)

  if (linkedGymIds.length === 0) {
    // Unaffiliated — only UserProgram subscribers can see the workouts.
    const sub = await prisma.userProgram.findUnique({
      where: { userId_programId: { userId, programId } },
      select: { userId: true },
    })
    return sub ? 'ok' : 'forbidden'
  }

  if (!linkedGymIds.includes(gymId)) return 'forbidden'

  if (program.visibility === 'PUBLIC') return 'ok'

  // PRIVATE: staff bypass + UserProgram subscribers
  if (callerGymRole === 'OWNER' || callerGymRole === 'PROGRAMMER' || callerGymRole === 'COACH') return 'ok'
  const sub = await prisma.userProgram.findUnique({
    where: { userId_programId: { userId, programId } },
    select: { userId: true },
  })
  return sub ? 'ok' : 'forbidden'
}
