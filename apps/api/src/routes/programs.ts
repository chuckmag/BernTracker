import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { ProgramRole, Prisma, WorkoutImportStatus } from '@wodalytics/db'
import {
  CreateProgramSchema,
  UpdateProgramSchema,
  InviteProgramMemberSchema,
} from '@wodalytics/types'
import { requireAuth } from '../middleware/auth.js'
import {
  validateGymExists,
  requireGymMembership,
  requireGymWriteAccess,
  requireGymOwner,
} from '../middleware/gym.js'
import {
  requireProgramGymMembership,
  requireProgramGymWriteAccess,
  requireProgramGymOwner,
  requireProgramGymManager,
} from '../middleware/program.js'
import {
  findProgramsWithDetailsByGymId,
  findProgramWithDetailsByIdAndGymId,
  createProgramAndLinkToGym,
  findBrowseProgramsForGymAndUser,
  setGymProgramDefault,
  clearGymProgramDefault,
} from '../db/gymProgramDbManager.js'
import {
  findProgramWithGymIds,
  updateProgramById,
  deleteProgramById,
  isProgramDefaultForAnyGym,
} from '../db/programDbManager.js'
import {
  findGymMembershipByUserAndGym,
  findGymMemberByEmail,
} from '../db/userGymDbManager.js'
import {
  findProgramById,
  unsubscribeUserFromProgram,
  createUserProgramSubscription,
  findProgramMembersWithUserInfo,
  findProgramsAvailableToUserInGym,
} from '../db/userProgramDbManager.js'
import {
  createWorkoutImport,
  findWorkoutImportByIdAndProgramId,
  findWorkoutImportsByProgramId,
  markWorkoutImportFailed,
  createDraftWorkoutsFromImport,
  publishDraftWorkoutsForImport,
  findCollisionsForProgram,
} from '../db/workoutImportDbManager.js'
import { findAllActiveNamedWorkouts } from '../db/namedWorkoutDbManager.js'
import {
  parseWorkoutImportFile,
  ParseFatalError,
  type ParsedRow,
  type ParseIssue,
} from '../lib/workoutImportParser.js'

const STAFF_ROLES = ['OWNER', 'PROGRAMMER', 'COACH'] as const

// Slice 6 / #89 — multipart upload limits. 5 MB cap matches the issue spec.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
})

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /api/me/programs?gymId=…  — caller's available programs (slice 3).
//        Staff sees every gym program; MEMBER sees only their subscriptions.
//        Drives the sidebar ProgramFilterPicker so members never see programs
//        they were never invited to.
router.get('/me/programs', requireAuth, listMyProgramsInGym)

// GET  /api/gyms/:gymId/programs
router.get('/gyms/:gymId/programs', requireAuth, validateGymExists, requireGymMembership, listProgramsForGym)

// GET  /api/gyms/:gymId/programs/browse  — PUBLIC programs the caller hasn't joined yet (slice 4)
router.get('/gyms/:gymId/programs/browse', requireAuth, validateGymExists, requireGymMembership, listBrowseProgramsForGym)

// POST /api/gyms/:gymId/programs
router.post('/gyms/:gymId/programs', requireAuth, validateGymExists, requireGymWriteAccess, createProgramForGym)

// GET    /api/programs/:id
router.get('/programs/:id', requireAuth, requireProgramGymMembership, getProgramById)

// PATCH  /api/programs/:id
router.patch('/programs/:id', requireAuth, requireProgramGymWriteAccess, patchProgram)

// DELETE /api/programs/:id
router.delete('/programs/:id', requireAuth, requireProgramGymOwner, deleteProgram)

// GET    /api/programs/:id/members  — list subscribers (slice 3)
router.get('/programs/:id/members', requireAuth, requireProgramGymWriteAccess, listProgramMembers)

// POST   /api/programs/:id/members  — invite a gym member onto the program (slice 3)
router.post('/programs/:id/members', requireAuth, requireProgramGymManager, inviteProgramMember)

// DELETE /api/programs/:id/members/:userId  — remove a member's subscription (slice 3)
router.delete('/programs/:id/members/:userId', requireAuth, requireProgramGymManager, removeProgramMember)

// POST /api/programs/:id/subscribe  — self-subscribe (slice 4). Caller must be
//        a member of one of the program's linked gyms; program must be PUBLIC.
//        Returns 403 on PRIVATE, 409 on duplicate.
router.post('/programs/:id/subscribe', requireAuth, selfSubscribeToProgram)

// DELETE /api/programs/:id/subscribe  — leave a program (slice 4). Mirrors the
//        self-subscribe endpoint. Staff-managed removal lives at /members/:userId.
router.delete('/programs/:id/subscribe', requireAuth, selfUnsubscribeFromProgram)

// PATCH /api/gyms/:gymId/programs/:programId/default  — mark as gym default (slice 5)
//        OWNER only. Transactional clear-and-set. Rejects PRIVATE programs (400).
router.patch(
  '/gyms/:gymId/programs/:programId/default',
  requireAuth,
  validateGymExists,
  requireGymOwner,
  setProgramAsGymDefault,
)

// DELETE /api/gyms/:gymId/programs/:programId/default  — clear default flag (slice 5)
//        OWNER only. Idempotent. Required so OWNERs can flip a previously-default
//        program back to PRIVATE (the visibility PATCH refuses while default is set).
router.delete(
  '/gyms/:gymId/programs/:programId/default',
  requireAuth,
  validateGymExists,
  requireGymOwner,
  clearProgramAsGymDefault,
)

// ─── Slice 6: bulk CSV/XLSX workout import (#89) ──────────────────────────────
// All five endpoints gated by requireProgramGymManager (OWNER + PROGRAMMER).
// COACH and MEMBER receive 403 — only programmers should be touching the
// program's workout list.

// POST /api/programs/:id/imports — upload + parse + persist preview (PENDING)
router.post(
  '/programs/:id/imports',
  requireAuth,
  requireProgramGymManager,
  upload.single('file'),
  uploadProgramImport,
)

// GET  /api/programs/:id/imports — list import history for the program
router.get(
  '/programs/:id/imports',
  requireAuth,
  requireProgramGymManager,
  listProgramImports,
)

// GET  /api/programs/:id/imports/:importId — re-fetch a parsed preview
router.get(
  '/programs/:id/imports/:importId',
  requireAuth,
  requireProgramGymManager,
  getProgramImport,
)

// POST /api/programs/:id/imports/:importId/draft — confirm preview → create DRAFT workouts
router.post(
  '/programs/:id/imports/:importId/draft',
  requireAuth,
  requireProgramGymManager,
  draftProgramImport,
)

// POST /api/programs/:id/imports/:importId/publish — bulk-publish the import's drafts
router.post(
  '/programs/:id/imports/:importId/publish',
  requireAuth,
  requireProgramGymManager,
  publishProgramImport,
)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listProgramsForGym(req: Request, res: Response) {
  const gymPrograms = await findProgramsWithDetailsByGymId(req.params.gymId as string)
  res.json(gymPrograms)
}

async function listMyProgramsInGym(req: Request, res: Response) {
  const userId = req.user!.id
  const gymId = typeof req.query.gymId === 'string' ? req.query.gymId : undefined
  if (!gymId) return res.status(400).json({ error: 'Query param gymId is required' })
  const membership = await findGymMembershipByUserAndGym(userId, gymId)
  if (!membership) return res.status(403).json({ error: 'Forbidden' })
  const isStaff = (STAFF_ROLES as readonly string[]).includes(membership.role)
  const rows = await findProgramsAvailableToUserInGym(userId, gymId, isStaff)
  res.json(rows)
}

async function createProgramForGym(req: Request, res: Response) {
  const parsed = CreateProgramSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const gymId = req.params.gymId as string
  const result = await createProgramAndLinkToGym(gymId, parsed.data)
  res.status(201).json(result)
}

async function getProgramById(req: Request, res: Response) {
  const programId = req.params.id as string
  const userId = req.user!.id

  // Find a GymProgram row for any gym the caller belongs to — the shape returned
  // matches the list endpoint so the detail page can reuse the same type.
  const program = await prismaFindDetailForCaller(programId, userId)
  if (!program) return res.status(404).json({ error: 'Program not found' })
  res.json(program)
}

async function patchProgram(req: Request, res: Response) {
  const parsed = UpdateProgramSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const { name, description, startDate, endDate, coverColor, visibility } = parsed.data

  // Refuse to flip a default program to PRIVATE — the OWNER must explicitly
  // clear the default first (slice 5 / #88). Auto-clearing was rejected
  // because flipping a single field could silently affect every gym member's
  // picker; we'd rather the OWNER make two deliberate decisions.
  if (visibility === 'PRIVATE' && (await isProgramDefaultForAnyGym(req.params.id as string))) {
    return res.status(400).json({
      error: 'Cannot make a default program private. Clear the gym default first, then change visibility.',
    })
  }

  const program = await updateProgramById(req.params.id as string, {
    name,
    description,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate === null ? null : endDate ? new Date(endDate) : undefined,
    coverColor,
    visibility,
  })
  res.json(program)
}

async function listBrowseProgramsForGym(req: Request, res: Response) {
  const gymId = req.params.gymId as string
  const userId = req.user!.id
  const rows = await findBrowseProgramsForGymAndUser(gymId, userId)
  res.json(rows)
}

async function deleteProgram(req: Request, res: Response) {
  await deleteProgramById(req.params.id as string)
  res.status(204).send()
}

async function listProgramMembers(req: Request, res: Response) {
  const programId = req.params.id as string
  const rows = await findProgramMembersWithUserInfo(programId)
  res.json(rows.map((r) => ({
    id: r.user.id,
    email: r.user.email,
    name: r.user.name,
    role: r.role,
    joinedAt: r.joinedAt,
  })))
}

async function inviteProgramMember(req: Request, res: Response) {
  const programId = req.params.id as string
  const parsed = InviteProgramMemberSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  // The program is linked to one or more gyms (via the middleware ctx). For
  // email lookup we need the canonical gym for this program — same approach
  // as getProgramById: walk the linked gyms, prefer one the operator belongs
  // to. With slice-3 scope (no cross-gym programs in practice) all linked
  // gyms collapse to the same id.
  const program = await findProgramWithGymIds(programId)
  if (!program) return res.status(404).json({ error: 'Program not found' })

  let targetUserId = parsed.data.userId ?? null
  if (!targetUserId && parsed.data.email) {
    const user = await findUserGymMemberAcrossLinkedGyms(parsed.data.email, program.gyms.map((g) => g.gymId))
    if (!user) return res.status(404).json({ error: 'No gym member found for that email' })
    targetUserId = user.id
  }
  if (!targetUserId) return res.status(400).json({ error: 'Either userId or email is required' })

  // Verify the target user actually belongs to one of the program's gyms —
  // prevents inviting a user from another gym via raw userId.
  const userIsGymMember = await isUserMemberOfAnyGym(targetUserId, program.gyms.map((g) => g.gymId))
  if (!userIsGymMember) {
    return res.status(404).json({ error: 'No gym member found for that user' })
  }

  const role = parsed.data.role === 'PROGRAMMER' ? ProgramRole.PROGRAMMER : ProgramRole.MEMBER
  try {
    const created = await createUserProgramSubscription(targetUserId, programId, role)
    res.status(201).json({
      programId,
      userId: created.userId,
      role: created.role,
      joinedAt: created.joinedAt,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Already a member' })
    }
    throw err
  }
}

async function removeProgramMember(req: Request, res: Response) {
  const programId = req.params.id as string
  const userId = req.params.userId as string
  try {
    await unsubscribeUserFromProgram(userId, programId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Membership not found' })
    }
    throw err
  }
  res.status(204).send()
}

async function selfSubscribeToProgram(req: Request, res: Response) {
  const programId = req.params.id as string
  const userId = req.user!.id

  const programWithGyms = await findProgramWithGymIds(programId)
  if (!programWithGyms) return res.status(404).json({ error: 'Program not found' })

  // Caller must belong to at least one gym linked to the program. Otherwise
  // they can't even know the program exists, let alone subscribe.
  const callerInLinkedGym = await isUserMemberOfAnyGym(userId, programWithGyms.gyms.map((g) => g.gymId))
  if (!callerInLinkedGym) return res.status(403).json({ error: 'Forbidden' })

  // Visibility check — PRIVATE programs only accept staff-managed invites.
  const programMeta = await findProgramById(programId)
  if (programMeta?.visibility === 'PRIVATE') {
    return res.status(403).json({ error: 'This program is private. Ask a staff member for an invite.' })
  }

  try {
    const created = await createUserProgramSubscription(userId, programId, ProgramRole.MEMBER)
    res.status(201).json({
      programId,
      userId: created.userId,
      role: created.role,
      joinedAt: created.joinedAt,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Already a member' })
    }
    throw err
  }
}

async function setProgramAsGymDefault(req: Request, res: Response) {
  const gymId = req.params.gymId as string
  const programId = req.params.programId as string
  try {
    const result = await setGymProgramDefault(gymId, programId)
    if (!result.ok) {
      if (result.reason === 'program-not-in-gym') {
        return res.status(404).json({ error: 'Program is not part of this gym' })
      }
      if (result.reason === 'program-private') {
        return res.status(400).json({ error: 'Default programs must be public. Change visibility first.' })
      }
    }
    res.status(204).send()
  } catch (err) {
    // The partial unique index `GymProgram_gym_default_key` is the last
    // line of defense against concurrent default-setters racing past the
    // clear-and-set transaction. P2002 means another caller won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Another program was just set as default. Please retry.' })
    }
    throw err
  }
}

async function clearProgramAsGymDefault(req: Request, res: Response) {
  const gymId = req.params.gymId as string
  const programId = req.params.programId as string
  await clearGymProgramDefault(gymId, programId)
  res.status(204).send()
}

async function selfUnsubscribeFromProgram(req: Request, res: Response) {
  const programId = req.params.id as string
  const userId = req.user!.id
  try {
    await unsubscribeUserFromProgram(userId, programId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Not a member' })
    }
    throw err
  }
  res.status(204).send()
}

// ── Local helpers ─────────────────────────────────────────────────────────────

// For GET /api/programs/:id we return the GymProgram-shaped detail for the first
// gym the caller belongs to that is linked to this program. Same shape as the
// list endpoint so the detail page can reuse the response type.
async function prismaFindDetailForCaller(programId: string, userId: string) {
  const program = await findProgramWithGymIds(programId)
  if (!program) return null
  for (const { gymId } of program.gyms) {
    const membership = await findGymMembershipByUserAndGym(userId, gymId)
    if (membership) {
      const detail = await findProgramWithDetailsByIdAndGymId(programId, gymId)
      if (detail) return detail
    }
  }
  return null
}

async function findUserGymMemberAcrossLinkedGyms(email: string, gymIds: string[]) {
  for (const gymId of gymIds) {
    const user = await findGymMemberByEmail(email, gymId)
    if (user) return user
  }
  return null
}

async function isUserMemberOfAnyGym(userId: string, gymIds: string[]): Promise<boolean> {
  for (const gymId of gymIds) {
    const m = await findGymMembershipByUserAndGym(userId, gymId)
    if (m) return true
  }
  return false
}

// ─── Slice 6: bulk import handlers ────────────────────────────────────────────

interface PreviewRow extends ParsedRow {
  // Set in the preview response when an existing Workout already occupies
  // (programId, scheduledAt, dayOrder). Surfaces in the UI as a "Replace
  // existing" toggle. v1 only flags collisions, doesn't honor a replace flag —
  // the user is expected to delete the old workout via the calendar instead.
  collision: boolean
  // Set in the preview response when `namedWorkout` could be matched against
  // a NamedWorkout (by name or alias, case-insensitive). null otherwise.
  namedWorkoutId: string | null
}

interface PreviewPayload {
  rows: PreviewRow[]
  warnings: ParseIssue[]
  errors: ParseIssue[]
}

async function uploadProgramImport(req: Request, res: Response) {
  const programId = req.params.id as string
  const file = req.file
  if (!file) return res.status(400).json({ error: 'No file uploaded — expected multipart field "file"' })

  const filename = file.originalname || 'upload'
  // Multer's fileSize limit already errors at MAX_UPLOAD_BYTES; this branch
  // covers the unlikely path where the limit was raised but a stale request
  // sneaks through. Keep the explicit bound check so the error message is ours.
  if (file.size > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` })
  }

  let parsed
  try {
    parsed = await parseWorkoutImportFile(file.buffer, filename)
  } catch (err) {
    if (err instanceof ParseFatalError) {
      // File-level fatal (missing header, unsupported type, empty file) —
      // record the import as FAILED for audit and return 400 with details.
      const failed = await createWorkoutImport({
        programId,
        uploadedBy: req.user!.id,
        filename,
        rowCount: 0,
        parsedJson: null,
        errorJson: err.issues as unknown as Prisma.InputJsonValue,
        status: WorkoutImportStatus.FAILED,
      })
      return res.status(400).json({
        importId: failed.id,
        errors: err.issues,
      })
    }
    throw err
  }

  // Resolve named_workout strings against active NamedWorkouts (case-insensitive,
  // checks aliases too). Bounded set (~100 rows) — load once and match in JS.
  const named = await findAllActiveNamedWorkouts()
  const nameLookup = new Map<string, string>()
  for (const nw of named) {
    nameLookup.set(nw.name.toLowerCase(), nw.id)
    for (const alias of nw.aliases) nameLookup.set(alias.toLowerCase(), nw.id)
  }

  const collisionKeys = await findCollisionsForProgram(
    programId,
    parsed.rows.map((r, idx) => ({
      scheduledAt: new Date(`${r.date}T00:00:00.000Z`),
      dayOrder: r.dayOrder ?? idx,
    })),
  )

  const previewRows: PreviewRow[] = parsed.rows.map((r, idx) => {
    const scheduledIso = new Date(`${r.date}T00:00:00.000Z`).toISOString()
    const dayOrder = r.dayOrder ?? idx
    const collision = collisionKeys.has(`${scheduledIso}|${dayOrder}`)
    const namedWorkoutId = r.namedWorkout ? nameLookup.get(r.namedWorkout.toLowerCase()) ?? null : null
    if (r.namedWorkout && !namedWorkoutId) {
      parsed.warnings.push({
        rowIndex: r.rowIndex,
        column: 'named_workout',
        level: 'warning',
        message: `Unknown named workout "${r.namedWorkout}" — will save as a plain workout`,
      })
    }
    return { ...r, collision, namedWorkoutId }
  })

  const payload: PreviewPayload = {
    rows: previewRows,
    warnings: parsed.warnings,
    errors: parsed.errors,
  }

  const created = await createWorkoutImport({
    programId,
    uploadedBy: req.user!.id,
    filename,
    rowCount: parsed.rowCount,
    parsedJson: payload as unknown as Prisma.InputJsonValue,
    errorJson: parsed.errors.length > 0 ? (parsed.errors as unknown as Prisma.InputJsonValue) : null,
    status: WorkoutImportStatus.PENDING,
  })

  res.status(201).json({
    importId: created.id,
    status: created.status,
    rowCount: created.rowCount,
    filename: created.filename,
    preview: payload,
  })
}

async function listProgramImports(req: Request, res: Response) {
  const programId = req.params.id as string
  const imports = await findWorkoutImportsByProgramId(programId)
  res.json(
    imports.map((i) => ({
      id: i.id,
      filename: i.filename,
      rowCount: i.rowCount,
      createdCount: i.createdCount,
      skippedCount: i.skippedCount,
      status: i.status,
      uploadedBy: i.uploadedBy,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      // The full parsedJson can be megabytes — only ship error summaries here.
      // Callers that need the preview rows go through GET /imports/:importId.
      errorJson: i.errorJson,
    })),
  )
}

async function getProgramImport(req: Request, res: Response) {
  const programId = req.params.id as string
  const importId = req.params.importId as string
  const row = await findWorkoutImportByIdAndProgramId(importId, programId)
  if (!row) return res.status(404).json({ error: 'Import not found' })
  res.json({
    id: row.id,
    filename: row.filename,
    rowCount: row.rowCount,
    createdCount: row.createdCount,
    skippedCount: row.skippedCount,
    status: row.status,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    preview: row.parsedJson,
    errorJson: row.errorJson,
  })
}

async function draftProgramImport(req: Request, res: Response) {
  const programId = req.params.id as string
  const importId = req.params.importId as string
  const row = await findWorkoutImportByIdAndProgramId(importId, programId)
  if (!row) return res.status(404).json({ error: 'Import not found' })
  if (row.status !== WorkoutImportStatus.PENDING) {
    return res.status(409).json({ error: `Cannot create drafts — import is ${row.status}` })
  }

  const preview = row.parsedJson as unknown as PreviewPayload | null
  if (!preview) return res.status(409).json({ error: 'Import has no parsed preview' })
  if (preview.errors.length > 0) {
    return res.status(400).json({ error: 'Cannot create drafts while blocking errors are present', errors: preview.errors })
  }

  // Skip rows the user opted to leave as collisions (default: skip every collision).
  // Replace-existing behavior is out of scope for v1; the user can delete the
  // old workout via the calendar, then re-upload to bring the new draft in.
  const toCreate = preview.rows.filter((r) => !r.collision)
  const skipped = preview.rows.length - toCreate.length

  const result = await createDraftWorkoutsFromImport(
    programId,
    importId,
    toCreate.map((r, idx) => ({
      title: r.title,
      description: r.description,
      type: r.type,
      scheduledAt: new Date(`${r.date}T00:00:00.000Z`),
      dayOrder: r.dayOrder ?? idx,
      namedWorkoutId: r.namedWorkoutId,
    })),
  )

  res.json({
    status: 'DRAFT',
    createdCount: result.createdCount,
    skippedCount: skipped,
    workoutIds: result.workoutIds,
  })
}

async function publishProgramImport(req: Request, res: Response) {
  const programId = req.params.id as string
  const importId = req.params.importId as string
  const row = await findWorkoutImportByIdAndProgramId(importId, programId)
  if (!row) return res.status(404).json({ error: 'Import not found' })
  if (row.status === WorkoutImportStatus.PUBLISHED) {
    // Idempotent — a duplicate POST shouldn't error.
    return res.json({ status: 'PUBLISHED', publishedCount: 0, skippedCount: 0 })
  }
  if (row.status !== WorkoutImportStatus.DRAFT) {
    return res.status(409).json({ error: `Cannot publish — import is ${row.status}` })
  }

  const result = await publishDraftWorkoutsForImport(importId)
  res.json({
    status: 'PUBLISHED',
    publishedCount: result.publishedCount,
    skippedCount: result.skippedCount,
  })
}

// Multer error → JSON 4xx mapping. Mounted by index.ts via the global error
// handler when a multer-thrown error reaches it (e.g. file too large, too
// many files). Lives here so the route file owns the import-related error
// shape without leaking multer types into the global handler.
export function isMulterError(err: unknown): err is multer.MulterError {
  return err instanceof multer.MulterError
}
