import { prisma } from '../client.js'
import type { WorkoutCategory, WorkoutType } from '../client.js'

const templateWorkoutSelect = {
  select: {
    id: true,
    type: true,
    description: true,
    workoutMovements: {
      select: {
        movementId: true,
        movement: { select: { id: true, name: true, parentId: true } },
      },
    },
  },
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
  template?: { type: WorkoutType; description: string; movementIds?: string[] }
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
        scheduledAt: new Date('2000-01-01T00:00:00Z'),
        ...(data.template.movementIds?.length
          ? { workoutMovements: { create: data.template.movementIds.map((id) => ({ movementId: id })) } }
          : {}),
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

export async function findNamedWorkoutByName(name: string) {
  return prisma.namedWorkout.findUnique({ where: { name } })
}

export async function createNamedWorkoutFromExternalSource(data: {
  name: string
  category: WorkoutCategory
  description?: string | null
  sourceUrl?: string | null
  aliases?: string[]
  template: { type: WorkoutType; description: string }
}) {
  // Sentinel scheduledAt (year 2000) keeps the non-nullable column satisfied
  // while ensuring template rows never appear in any gym-scoped date-range query.
  const tw = await prisma.workout.create({
    data: {
      title: data.name,
      description: data.template.description,
      type: data.template.type,
      scheduledAt: new Date('2000-01-01T00:00:00Z'),
    },
  })

  return prisma.namedWorkout.create({
    data: {
      name: data.name,
      category: data.category,
      aliases: data.aliases ?? [],
      description: data.description ?? null,
      sourceUrl: data.sourceUrl ?? null,
      templateWorkoutId: tw.id,
    },
  })
}

export async function upsertNamedWorkoutFromExternalSource(data: {
  name: string
  category: WorkoutCategory
  description?: string | null
  sourceUrl?: string | null
  aliases?: string[]
  template: { type: WorkoutType; description: string }
}) {
  // Determine whether a template workout already exists so we update in place
  // rather than orphaning the old row.
  const existing = await prisma.namedWorkout.findUnique({
    where: { name: data.name },
    select: { templateWorkoutId: true },
  })

  let templateWorkoutId: string

  if (existing?.templateWorkoutId) {
    await prisma.workout.update({
      where: { id: existing.templateWorkoutId },
      data: { description: data.template.description, type: data.template.type },
    })
    templateWorkoutId = existing.templateWorkoutId
  } else {
    const tw = await prisma.workout.create({
      data: {
        title: data.name,
        description: data.template.description,
        type: data.template.type,
        scheduledAt: new Date('2000-01-01T00:00:00Z'),
      },
    })
    templateWorkoutId = tw.id
  }

  return prisma.namedWorkout.upsert({
    where: { name: data.name },
    update: {
      description: data.description ?? null,
      sourceUrl: data.sourceUrl ?? null,
      templateWorkoutId,
    },
    create: {
      name: data.name,
      category: data.category,
      aliases: data.aliases ?? [],
      description: data.description ?? null,
      sourceUrl: data.sourceUrl ?? null,
      templateWorkoutId,
    },
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
