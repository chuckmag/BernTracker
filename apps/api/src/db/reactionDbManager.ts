import { prisma } from '@wodalytics/db'

export const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '💪', '🎉', '😂'] as const
const ALLOWED_EMOJI_SET = new Set<string>(ALLOWED_EMOJIS)

function assertAllowedEmoji(emoji: string) {
  if (!ALLOWED_EMOJI_SET.has(emoji)) {
    throw Object.assign(new Error(`Emoji not in allowed set`), { statusCode: 400 })
  }
}

export async function addReactionToResult(resultId: string, userId: string, emoji: string) {
  assertAllowedEmoji(emoji)
  const result = await prisma.result.findUnique({ where: { id: resultId }, select: { id: true } })
  if (!result) throw Object.assign(new Error('Result not found'), { statusCode: 404 })
  try {
    return await prisma.reaction.create({ data: { resultId, userId, emoji } })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      throw Object.assign(new Error('Reaction already exists'), { statusCode: 409 })
    }
    throw err
  }
}

export async function removeReactionFromResult(resultId: string, userId: string, emoji: string) {
  assertAllowedEmoji(emoji)
  const deleted = await prisma.reaction.deleteMany({ where: { resultId, userId, emoji } })
  if (deleted.count === 0) throw Object.assign(new Error('Reaction not found'), { statusCode: 404 })
}

export async function addReactionToComment(commentId: string, userId: string, emoji: string) {
  assertAllowedEmoji(emoji)
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, deletedAt: true } })
  if (!comment) throw Object.assign(new Error('Comment not found'), { statusCode: 404 })
  if (comment.deletedAt) throw Object.assign(new Error('Cannot react to a deleted comment'), { statusCode: 422 })
  try {
    return await prisma.reaction.create({ data: { commentId, userId, emoji } })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      throw Object.assign(new Error('Reaction already exists'), { statusCode: 409 })
    }
    throw err
  }
}

export async function removeReactionFromComment(commentId: string, userId: string, emoji: string) {
  assertAllowedEmoji(emoji)
  const deleted = await prisma.reaction.deleteMany({ where: { commentId, userId, emoji } })
  if (deleted.count === 0) throw Object.assign(new Error('Reaction not found'), { statusCode: 404 })
}

export async function findReactionSummaryByResultId(resultId: string, callerUserId: string) {
  const result = await prisma.result.findUnique({ where: { id: resultId }, select: { id: true } })
  if (!result) throw Object.assign(new Error('Result not found'), { statusCode: 404 })

  const rows = await prisma.reaction.findMany({
    where: { resultId },
    select: { userId: true, emoji: true },
  })

  const byEmoji = new Map<string, { count: number; userReacted: boolean }>()
  for (const r of rows) {
    const prev = byEmoji.get(r.emoji) ?? { count: 0, userReacted: false }
    byEmoji.set(r.emoji, {
      count: prev.count + 1,
      userReacted: prev.userReacted || r.userId === callerUserId,
    })
  }
  return [...byEmoji.entries()].map(([emoji, data]) => ({ emoji, ...data }))
}
