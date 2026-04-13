import { prisma } from '@berntracker/db'
import type { WorkoutCategory, WorkoutType } from '@berntracker/db'

const templateWorkoutSelect = {
  select: { id: true, type: true, description: true, movements: true },
} as const

export async function findAllActiveNamedWorkouts() {
  return prisma.namedWorkout.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { templateWorkout: templateWorkoutSelect },
  })
}

export async function findNamedWorkoutById(id: string) {
  return prisma.namedWorkout.findUnique({
    where: { id },
    include: { templateWorkout: templateWorkoutSelect },
  })
}

export async function createNamedWorkoutWithOptionalTemplate(data: {
  name: string
  category: WorkoutCategory
  aliases?: string[]
  template?: { type: WorkoutType; description: string; movements?: string[] }
}) {
  let templateWorkoutId: string | undefined

  if (data.template) {
    // Template workout rows have no program, no scheduled date.
    // Sentinel scheduledAt keeps the non-nullable column satisfied while ensuring
    // these rows never appear in any gym-scoped date-range query.
    const tw = await prisma.workout.create({
      data: {
        title: data.name,
        description: data.template.description,
        type: data.template.type,
        movements: data.template.movements ?? [],
        scheduledAt: new Date('2000-01-01T00:00:00Z'),
      },
    })
    templateWorkoutId = tw.id
  }

  return prisma.namedWorkout.create({
    data: {
      name: data.name,
      category: data.category,
      aliases: data.aliases ?? [],
      templateWorkoutId,
    },
    include: { templateWorkout: templateWorkoutSelect },
  })
}

export async function updateNamedWorkoutById(
  id: string,
  data: {
    name?: string
    category?: WorkoutCategory
    aliases?: string[]
    isActive?: boolean
    templateWorkoutId?: string | null
  },
) {
  return prisma.namedWorkout.update({
    where: { id },
    data,
    include: { templateWorkout: templateWorkoutSelect },
  })
}
