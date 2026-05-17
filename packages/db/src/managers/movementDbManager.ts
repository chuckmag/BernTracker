import type { MovementCategory, MovementPrType } from '../client.js'
import { prisma } from '../client.js'

const movementBaseSelect = {
  select: { id: true, name: true, status: true, parentId: true, sourceUrl: true, aliases: true },
} as const

const movementWithVariationsSelect = {
  select: {
    id: true,
    name: true,
    status: true,
    category: true,
    prTypes: true,
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

export async function reviewMovementById(
  id: string,
  status: 'ACTIVE' | 'REJECTED',
  extra?: { category?: MovementCategory; prTypes?: MovementPrType[] },
) {
  const movement = await prisma.movement.findUnique({ where: { id } })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })
  if (movement.status !== 'PENDING') {
    throw Object.assign(new Error('Only PENDING movements can be reviewed'), { statusCode: 400 })
  }
  return prisma.movement.update({
    where: { id },
    data: {
      status,
      ...(status === 'ACTIVE' && extra?.category !== undefined && { category: extra.category }),
      ...(status === 'ACTIVE' && extra?.prTypes !== undefined && { prTypes: extra.prTypes }),
    },
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

export async function updateMovementById(
  id: string,
  data: { name?: string; parentId?: string | null; category?: MovementCategory; prTypes?: MovementPrType[] },
) {
  const movement = await prisma.movement.findUnique({ where: { id } })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })
  if (movement.status === 'REJECTED') {
    throw Object.assign(new Error('REJECTED movements cannot be edited'), { statusCode: 400 })
  }
  if (data.name && data.name !== movement.name) {
    const conflict = await prisma.movement.findUnique({ where: { name: data.name } })
    if (conflict) throw Object.assign(new Error('A movement with that name already exists'), { statusCode: 409 })
  }
  return prisma.movement.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.prTypes !== undefined && { prTypes: data.prTypes }),
    },
    ...movementWithVariationsSelect,
  })
}

export async function findLibraryMovementsForAdmin() {
  const rows = await prisma.movement.findMany({
    where: { status: { in: ['ACTIVE', 'PENDING'] } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      status: true,
      category: true,
      prTypes: true,
      aliases: true,
      sourceUrl: true,
      parentId: true,
      parent: { select: { name: true } },
      _count: { select: { variations: true } },
    },
  })
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    category: m.category,
    prTypes: m.prTypes,
    aliases: m.aliases,
    sourceUrl: m.sourceUrl,
    parentId: m.parentId,
    parentName: m.parent?.name ?? null,
    variationCount: m._count.variations,
  }))
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

