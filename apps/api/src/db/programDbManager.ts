import { prisma, type ProgramVisibility } from '@wodalytics/db'

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
 * Public-catalog filter for the admin surface: programs with no gym link
 * AND no `ownerUserId` (i.e. not a Personal Program — those belong to a
 * specific user and are private by design). The two conditions together
 * isolate true "WODalytics-curated" programs like the CrossFit Mainsite
 * ingest from both gym-scoped programs and per-user Personal Programs.
 */
const ADMIN_CATALOG_WHERE = {
  gyms: { none: {} },
  ownerUserId: null,
} as const

/**
 * Lists every public-catalog program (gym-less + non-Personal), regardless
 * of caller subscription. Used by the WODalytics admin surface (#160) to
 * enumerate programs that need curation. Differs from
 * `findUnaffiliatedPublicProgramsForUser` which excludes the caller's own
 * subscriptions for the public-catalog browse use case — admins need the
 * full list.
 */
export async function findAllUnaffiliatedPrograms() {
  return prisma.program.findMany({
    where: ADMIN_CATALOG_WHERE,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { members: true, workouts: true } } },
  })
}

/**
 * Look up a single public-catalog program by id with the same `_count`
 * shape the list endpoint returns. Returns null when the program does not
 * exist, has a gym link, or is a Personal Program — those cases would
 * stray the admin surface onto material that has its own auth boundary.
 * Callers should treat null as 404.
 */
export async function findUnaffiliatedProgramByIdWithCounts(id: string) {
  return prisma.program.findFirst({
    where: { id, ...ADMIN_CATALOG_WHERE },
    include: { _count: { select: { members: true, workouts: true } } },
  })
}

/**
 * Same predicate as `findUnaffiliatedProgramByIdWithCounts` but without the
 * `_count` payload — for mutation handlers that just need the existence +
 * access check before delegating to a generic update / delete.
 */
export async function findUnaffiliatedProgramById(id: string) {
  return prisma.program.findFirst({
    where: { id, ...ADMIN_CATALOG_WHERE },
  })
}

interface CreateUnaffiliatedProgramData {
  name: string
  description?: string | null
  startDate: Date
  endDate?: Date | null
  coverColor?: string | null
  visibility?: ProgramVisibility
}

/**
 * Creates a new public-catalog program (no gym link, no owner). Visibility
 * defaults to PUBLIC — the whole point of admin curation is discoverability
 * across gyms.
 */
export async function createUnaffiliatedProgram(data: CreateUnaffiliatedProgramData) {
  return prisma.program.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      coverColor: data.coverColor ?? null,
      visibility: data.visibility ?? 'PUBLIC',
    },
    include: { _count: { select: { members: true, workouts: true } } },
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
