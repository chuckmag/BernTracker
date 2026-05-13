import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma, WorkoutStatus, findOrCreatePersonalProgramForUser, createWorkoutForProgram, findAllActiveMovements } from '@wodalytics/db'
import { mcpUnauthorized, resolveUserId, userGymIds, userProgramIds } from './shared.js'

// Simple fuzzy movement resolver: exact match first, then case-insensitive,
// then alias match, then substring. Returns the matched ID or null with candidates.
async function resolveMovementByName(name: string): Promise<
  | { found: true; id: string; name: string }
  | { found: false; candidates: string[] }
> {
  const movements = await findAllActiveMovements()
  const needle = name.toLowerCase().trim()

  // Exact canonical name
  const exact = movements.find((m) => m.name.toLowerCase() === needle)
  if (exact) return { found: true, id: exact.id, name: exact.name }

  // Alias exact match
  const aliasExact = movements.find((m) => m.aliases.some((a) => a.toLowerCase() === needle))
  if (aliasExact) return { found: true, id: aliasExact.id, name: aliasExact.name }

  // Substring match on name or alias
  const substring = movements.filter(
    (m) =>
      m.name.toLowerCase().includes(needle) ||
      m.aliases.some((a) => a.toLowerCase().includes(needle)),
  )
  if (substring.length === 1) return { found: true, id: substring[0].id, name: substring[0].name }

  // Collect closest candidates (first 5 substring matches, or full list truncated)
  const candidates = (substring.length > 0 ? substring : movements)
    .slice(0, 5)
    .map((m) => m.name)
  return { found: false, candidates }
}

export function registerProgramTools(server: McpServer, ctxUserId?: string): void {
  server.tool(
    'get_programs',
    'List programs the user is enrolled in, including their personal program and gym programs.',
    {},
    async () => {
      const userId = resolveUserId(ctxUserId)
      if (!userId) return mcpUnauthorized()

      const gymIds = await userGymIds(userId)
      const subscribedProgramIds = await userProgramIds(userId)

      // Gym-linked programs
      const gymPrograms = gymIds.length > 0
        ? await prisma.gymProgram.findMany({
            where: { gymId: { in: gymIds } },
            include: { program: { select: { id: true, name: true, visibility: true, ownerUserId: true } } },
          })
        : []

      // User's direct subscriptions (unaffiliated programs)
      const userPrograms = await prisma.userProgram.findMany({
        where: { userId },
        include: { program: { select: { id: true, name: true, visibility: true, ownerUserId: true } } },
      })

      // Deduplicate by program id, prefer gym-linked info
      const seen = new Map<string, { id: string; name: string; visibility: string; role: string; isPersonal: boolean }>()

      for (const gp of gymPrograms) {
        const p = gp.program
        seen.set(p.id, {
          id: p.id,
          name: p.name,
          visibility: p.visibility,
          role: 'MEMBER',
          isPersonal: p.ownerUserId === userId,
        })
      }

      for (const up of userPrograms) {
        const p = up.program
        if (!seen.has(p.id)) {
          seen.set(p.id, {
            id: p.id,
            name: p.name,
            visibility: p.visibility,
            role: up.role,
            isPersonal: p.ownerUserId === userId,
          })
        } else {
          // Enrich existing entry with the user's actual role
          seen.get(p.id)!.role = up.role
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify([...seen.values()]) }] }
    },
  )

  server.tool(
    'create_workout',
    "Create a workout in the user's personal program. Movement names are fuzzy-matched against the movement library.",
    {
      title: z.string().describe('Workout title'),
      type: z
        .enum(['STRENGTH', 'FOR_TIME', 'EMOM', 'CARDIO', 'AMRAP', 'METCON', 'WARMUP'])
        .describe('Workout type'),
      description: z.string().optional().describe('Workout description or notes'),
      scheduledAt: z.string().optional().describe('ISO datetime string for when the workout is scheduled (defaults to now)'),
      movements: z
        .array(
          z.object({
            movementName: z.string().describe('Movement name — fuzzy-matched to the WODalytics movement library'),
            sets: z.number().int().positive().optional().describe('Number of sets'),
            reps: z.string().optional().describe('Reps (e.g. "10" or cluster "1.1.1")'),
            load: z.number().positive().optional().describe('Load amount'),
            loadUnit: z.enum(['LB', 'KG']).optional().describe('Load unit'),
            tracksLoad: z.boolean().optional().describe('Whether this movement tracks load (default true)'),
            displayOrder: z.number().int().nonnegative().describe('Position in workout (0-based)'),
          }),
        )
        .optional()
        .default([])
        .describe('Movements to include in the workout'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId)
      if (!userId) return mcpUnauthorized()

      // Resolve all movement names before writing anything
      const resolvedMovements: Array<{
        movementId: string
        displayOrder: number
        sets?: number
        reps?: string
        load?: number
        loadUnit?: 'LB' | 'KG'
        tracksLoad?: boolean
      }> = []

      for (const m of args.movements ?? []) {
        const result = await resolveMovementByName(m.movementName)
        if (!result.found) {
          return {
            content: [{
              type: 'text' as const,
              text: `Unknown movement: "${m.movementName}". Closest matches: ${result.candidates.join(', ')}. Try one of these names and retry.`,
            }],
            isError: true,
          }
        }
        resolvedMovements.push({
          movementId: result.id,
          displayOrder: m.displayOrder,
          sets: m.sets,
          reps: m.reps,
          load: m.load,
          loadUnit: m.loadUnit,
          tracksLoad: m.tracksLoad,
        })
      }

      const program = await findOrCreatePersonalProgramForUser(userId)

      const workout = await createWorkoutForProgram({
        programId: program.id,
        title: args.title,
        description: args.description ?? '',
        type: args.type,
        scheduledAt: args.scheduledAt ? new Date(args.scheduledAt) : new Date(),
        movements: resolvedMovements,
        status: WorkoutStatus.PUBLISHED,
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: workout.id,
            title: workout.title,
            type: workout.type,
            scheduledAt: workout.scheduledAt.toISOString(),
            programId: workout.programId,
          }),
        }],
      }
    },
  )
}
