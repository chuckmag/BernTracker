import { prisma } from '../client.js'
import type { WorkoutLevel, Prisma } from '../client.js'

interface UpsertWorkoutPlanData {
  userId: string
  workoutId: string
  level?: WorkoutLevel | null
  value?: Prisma.InputJsonValue | null
  notes?: string | null
  createdById: string
}

// ─── Shared select ─────────────────────────────────────────────────────────────

const createdBySelect = { select: { id: true, name: true, firstName: true, lastName: true } } as const
const userSelect      = { select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true } } as const

// ─── Queries ───────────────────────────────────────────────────────────────────

export async function findWorkoutPlanForUser(userId: string, workoutId: string) {
  return prisma.userWorkoutPlan.findUnique({
    where: { userId_workoutId: { userId, workoutId } },
    include: { createdBy: createdBySelect },
  })
}

export async function findWorkoutPlansForWorkout(workoutId: string) {
  return prisma.userWorkoutPlan.findMany({
    where: { workoutId },
    include: {
      user: userSelect,
      createdBy: createdBySelect,
    },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  })
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export async function upsertWorkoutPlanForUser(data: UpsertWorkoutPlanData) {
  const { userId, workoutId, createdById, ...fields } = data
  return prisma.userWorkoutPlan.upsert({
    where: { userId_workoutId: { userId, workoutId } },
    create: { userId, workoutId, createdById, ...fields },
    update: { createdById, ...fields },
    include: { createdBy: createdBySelect },
  })
}

export async function deleteWorkoutPlanForUser(userId: string, workoutId: string) {
  const existing = await prisma.userWorkoutPlan.findUnique({
    where: { userId_workoutId: { userId, workoutId } },
  })
  if (!existing) {
    const err = new Error('Plan not found')
    ;(err as Error & { statusCode: number }).statusCode = 404
    throw err
  }
  await prisma.userWorkoutPlan.delete({ where: { userId_workoutId: { userId, workoutId } } })
}
