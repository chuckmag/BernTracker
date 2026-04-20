import { prisma } from '@berntracker/db'

const movementBaseSelect = {
  select: { id: true, name: true, status: true, parentId: true },
} as const

const movementWithVariationsSelect = {
  select: {
    id: true,
    name: true,
    status: true,
    parentId: true,
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
