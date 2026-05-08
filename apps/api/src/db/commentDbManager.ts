import { prisma } from '@wodalytics/db'

// ─── Query helpers ────────────────────────────────────────────────────────────

const userSelect = { id: true, firstName: true, lastName: true, avatarUrl: true } as const
const reactionSelect = { userId: true, emoji: true } as const

function aggregateReactions(
  reactions: { userId: string; emoji: string }[],
  callerUserId: string,
) {
  const byEmoji = new Map<string, { count: number; userReacted: boolean }>()
  for (const r of reactions) {
    const prev = byEmoji.get(r.emoji) ?? { count: 0, userReacted: false }
    byEmoji.set(r.emoji, {
      count: prev.count + 1,
      userReacted: prev.userReacted || r.userId === callerUserId,
    })
  }
  return [...byEmoji.entries()].map(([emoji, data]) => ({ emoji, ...data }))
}

type RawReply = {
  id: string
  resultId: string
  userId: string | null
  body: string | null
  parentId: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
  user: { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null } | null
  reactions: { userId: string; emoji: string }[]
  replies: { id: string }[]
}

type RawComment = Omit<RawReply, 'replies'> & { replies: RawReply[] }

function formatReply(r: RawReply, callerUserId: string) {
  return {
    id: r.id,
    resultId: r.resultId,
    parentId: r.parentId,
    body: r.body,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    user: r.deletedAt ? null : r.user,
    reactions: aggregateReactions(r.reactions, callerUserId),
    replyCount: r.replies.length,
  }
}

function formatComment(c: RawComment, callerUserId: string) {
  return {
    id: c.id,
    resultId: c.resultId,
    parentId: c.parentId,
    body: c.body,
    deletedAt: c.deletedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    user: c.deletedAt ? null : c.user,
    reactions: aggregateReactions(c.reactions, callerUserId),
    replies: c.replies.map((r) => formatReply(r, callerUserId)),
    replyCount: c.replies.length,
  }
}

// ─── Public functions ─────────────────────────────────────────────────────────

export async function findCommentsByResultId(
  resultId: string,
  callerUserId: string,
  page: number,
  limit: number,
) {
  const result = await prisma.result.findUnique({ where: { id: resultId }, select: { id: true } })
  if (!result) throw Object.assign(new Error('Result not found'), { statusCode: 404 })

  const skip = (page - 1) * limit

  const [topLevel, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where: { resultId, parentId: null },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
      include: {
        user: { select: userSelect },
        reactions: { select: reactionSelect },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: userSelect },
            reactions: { select: reactionSelect },
            replies: { select: { id: true } },
          },
        },
      },
    }),
    prisma.comment.count({ where: { resultId, parentId: null } }),
  ])

  return {
    comments: (topLevel as RawComment[]).map((c) => formatComment(c, callerUserId)),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }
}

export async function createTopLevelComment(resultId: string, userId: string, body: string) {
  const result = await prisma.result.findUnique({ where: { id: resultId }, select: { id: true } })
  if (!result) throw Object.assign(new Error('Result not found'), { statusCode: 404 })
  return prisma.comment.create({ data: { resultId, userId, body } })
}

export async function createReply(parentId: string, userId: string, body: string) {
  const parent = await prisma.comment.findUnique({
    where: { id: parentId },
    select: { id: true, resultId: true, deletedAt: true },
  })
  if (!parent) throw Object.assign(new Error('Comment not found'), { statusCode: 404 })
  if (parent.deletedAt) throw Object.assign(new Error('Cannot reply to a deleted comment'), { statusCode: 422 })
  return prisma.comment.create({ data: { resultId: parent.resultId, userId, body, parentId } })
}

export async function editComment(commentId: string, userId: string, body: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment) throw Object.assign(new Error('Comment not found'), { statusCode: 404 })
  if (comment.deletedAt) throw Object.assign(new Error('Cannot edit a deleted comment'), { statusCode: 422 })
  if (comment.userId !== userId) throw Object.assign(new Error('You do not own this comment'), { statusCode: 403 })
  return prisma.comment.update({ where: { id: commentId }, data: { body } })
}

export async function softDeleteComment(commentId: string, userId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment) throw Object.assign(new Error('Comment not found'), { statusCode: 404 })
  if (comment.deletedAt) return // already soft-deleted — idempotent
  if (comment.userId !== userId) throw Object.assign(new Error('You do not own this comment'), { statusCode: 403 })
  await prisma.comment.update({
    where: { id: commentId },
    data: { body: null, userId: null, deletedAt: new Date() },
  })
}
