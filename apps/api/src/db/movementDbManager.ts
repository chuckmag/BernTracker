import { prisma } from '@wodalytics/db'

const movementBaseSelect = {
  select: { id: true, name: true, status: true, parentId: true, sourceUrl: true, aliases: true },
} as const

const movementWithVariationsSelect = {
  select: {
    id: true,
    name: true,
    status: true,
    parentId: true,
    sourceUrl: true,
    aliases: true,
    parent: { select: { id: true, name: true } },
    variations: { select: { id: true, name: true } },
  },
} as const

export async function findAllActiveMovements() {
  return prisma.movement.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    ...movementBaseSelect,
  })
}

export async function findMovementById(id: string) {
  const movement = await prisma.movement.findUnique({ where: { id }, ...movementWithVariationsSelect })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })
  return movement
}

export async function createPendingMovement(data: { name: string; parentId?: string }) {
  const existing = await prisma.movement.findUnique({ where: { name: data.name } })
  if (existing) {
    throw Object.assign(new Error('A movement with that name already exists'), { statusCode: 409 })
  }
  return prisma.movement.create({
    data: { name: data.name, status: 'PENDING', parentId: data.parentId ?? null },
    ...movementWithVariationsSelect,
  })
}

export async function findPendingMovements() {
  return prisma.movement.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    ...movementBaseSelect,
  })
}

export async function reviewMovementById(id: string, status: 'ACTIVE' | 'REJECTED') {
  const movement = await prisma.movement.findUnique({ where: { id } })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })
  if (movement.status !== 'PENDING') {
    throw Object.assign(new Error('Only PENDING movements can be reviewed'), { statusCode: 400 })
  }
  return prisma.movement.update({
    where: { id },
    data: { status },
    ...movementWithVariationsSelect,
  })
}

export async function updatePendingMovementById(id: string, data: { name?: string; parentId?: string | null }) {
  const movement = await prisma.movement.findUnique({ where: { id } })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })
  if (movement.status !== 'PENDING') {
    throw Object.assign(new Error('Only PENDING movements can be edited'), { statusCode: 400 })
  }
  if (data.name && data.name !== movement.name) {
    const conflict = await prisma.movement.findUnique({ where: { name: data.name } })
    if (conflict) throw Object.assign(new Error('A movement with that name already exists'), { statusCode: 409 })
  }
  return prisma.movement.update({
    where: { id },
    data: { ...(data.name !== undefined && { name: data.name }), ...(data.parentId !== undefined && { parentId: data.parentId }) },
    ...movementWithVariationsSelect,
  })
}

export async function expandMovementIdsWithVariations(movementIds: string[]): Promise<string[]> {
  if (movementIds.length === 0) return []
  const movements = await prisma.movement.findMany({
    where: { id: { in: movementIds } },
    select: { id: true, variations: { select: { id: true } } },
  })
  const expanded = new Set(movementIds)
  for (const m of movements) {
    for (const v of m.variations) expanded.add(v.id)
  }
  return [...expanded]
}

