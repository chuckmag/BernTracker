import { prisma } from '@wodalytics/db'
import Fuse from 'fuse.js'

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

export async function detectMovementsInText(description: string) {
  const movements = await prisma.movement.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, parentId: true, aliases: true },
  })

  // Two-pass match. Pass 1 is an exact-token lookup against an alias index
  // — short abbreviations like "WB" or "KBS" need to match by literal
  // equality with a description token, not by fuzzy similarity. Fuse's
  // 0.3 threshold trips on 2-3 char tokens, and the canonical-name 60% gate
  // below would filter them out anyway. Aliases are an explicit declaration
  // by the programmer that a short form maps to this movement, so honor
  // them as strong signals.
  const aliasIndex = new Map<string, Set<string>>()
  for (const m of movements) {
    for (const alias of m.aliases) {
      const key = alias.toLowerCase()
      const set = aliasIndex.get(key) ?? new Set<string>()
      set.add(m.id)
      aliasIndex.set(key, set)
    }
  }

  const words = description.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const matchedIds = new Set<string>()

  // Pass 1: exact alias hits per token AND per multi-word ngram (so "Wall
  // Ball" — a 2-word alias on Wall-ball Shot — also matches).
  const allTokens = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    allTokens.add(words[i])
    if (words[i + 1]) allTokens.add(`${words[i]} ${words[i + 1]}`)
    if (words[i + 1] && words[i + 2]) allTokens.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  for (const tok of allTokens) {
    const ids = aliasIndex.get(tok)
    if (ids) for (const id of ids) matchedIds.add(id)
  }

  // Pass 2: fuzzy match against canonical names with the existing 60% gate.
  const fuse = new Fuse(movements, { keys: ['name'], threshold: 0.3, includeScore: true })
  const ngrams = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    // Skip very short single tokens — they fuzzy-match too broadly
    if (words[i].length >= 4) ngrams.add(words[i])
    if (words[i + 1]) ngrams.add(`${words[i]} ${words[i + 1]}`)
    if (words[i + 1] && words[i + 2]) ngrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  for (const gram of ngrams) {
    for (const result of fuse.search(gram)) {
      // Prevents short n-grams ("pull") from matching long names ("Burpee Pull-up", "Sumo Deadlift High Pull").
      if (gram.length / result.item.name.length >= 0.6) {
        matchedIds.add(result.item.id)
      }
    }
  }

  return movements.filter((m) => matchedIds.has(m.id))
}
