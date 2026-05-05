import { prisma, type Role, type InvitationStatus } from '@wodalytics/db'
import crypto from 'node:crypto'

// No 0/O/1/I to avoid visual ambiguity when reading codes aloud or off a screen
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const EXPIRY_DAYS = 7

const INVITATION_INCLUDE = {
  gym: { select: { id: true, name: true, slug: true } },
  invitedBy: { select: { id: true, firstName: true, lastName: true } },
} as const

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  return Array.from(bytes, (b) => CODE_CHARSET[b % CODE_CHARSET.length]).join('')
}

export async function createInvitation(args: {
  channel: 'EMAIL' | 'SMS'
  email?: string
  phone?: string
  gymId?: string
  roleToGrant: Role
  invitedById: string
}) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  // Retry up to 5 times on the rare unique-code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.invitation.create({
        data: {
          code: generateCode(),
          channel: args.channel,
          email: args.email ?? null,
          phone: args.phone ?? null,
          gymId: args.gymId ?? null,
          roleToGrant: args.roleToGrant,
          invitedById: args.invitedById,
          expiresAt,
        },
        include: INVITATION_INCLUDE,
      })
    } catch (err: unknown) {
      const isCodeCollision =
        err instanceof Error &&
        err.message.includes('Unique constraint') &&
        err.message.includes('code')
      if (!isCodeCollision || attempt === 4) throw err
    }
  }
  throw new Error('Failed to generate a unique invite code after 5 attempts')
}

export async function findInvitationByCode(code: string) {
  return prisma.invitation.findUnique({
    where: { code },
    include: INVITATION_INCLUDE,
  })
}

export async function findPendingInvitationsByEmail(email: string) {
  return prisma.invitation.findMany({
    where: { email: email.toLowerCase(), status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: INVITATION_INCLUDE,
  })
}

export async function findInvitationById(id: string) {
  return prisma.invitation.findUnique({
    where: { id },
    include: INVITATION_INCLUDE,
  })
}

export async function findExistingPendingCodeInvite(args: {
  gymId?: string
  email?: string
  phone?: string
}) {
  if (!args.email && !args.phone) return null
  return prisma.invitation.findFirst({
    where: {
      status: 'PENDING',
      gymId: args.gymId ?? null,
      ...(args.email ? { email: args.email.toLowerCase() } : {}),
      ...(args.phone ? { phone: args.phone } : {}),
    },
  })
}

export async function setInvitationStatus(args: {
  id: string
  status: InvitationStatus
  acceptedById?: string
}) {
  return prisma.invitation.update({
    where: { id: args.id },
    data: {
      status: args.status,
      ...(args.acceptedById ? { acceptedById: args.acceptedById } : {}),
    },
    include: INVITATION_INCLUDE,
  })
}

// Atomic: mark the Invitation ACCEPTED, create a GymMembershipRequest (APPROVED)
// for audit continuity, and upsert the UserGym row — all in one transaction.
export async function acceptPreSignupInvitationAndJoinGym(args: {
  invitationId: string
  userId: string
  gymId: string
  roleToGrant: Role
  invitedById: string
}) {
  return prisma.$transaction(async (tx) => {
    await tx.gymMembershipRequest.create({
      data: {
        gymId: args.gymId,
        direction: 'STAFF_INVITED',
        status: 'APPROVED',
        userId: args.userId,
        roleToGrant: args.roleToGrant,
        invitedById: args.invitedById,
        decidedById: args.userId,
        decidedAt: new Date(),
      },
    })
    await tx.userGym.upsert({
      where: { userId_gymId: { userId: args.userId, gymId: args.gymId } },
      update: { role: args.roleToGrant },
      create: { userId: args.userId, gymId: args.gymId, role: args.roleToGrant },
    })
    return tx.invitation.update({
      where: { id: args.invitationId },
      data: { status: 'ACCEPTED', acceptedById: args.userId },
      include: INVITATION_INCLUDE,
    })
  })
}
