import { prisma, type Role, type MembershipRequestStatus } from '@wodalytics/db'

const REQUEST_SELECT = {
  id: true,
  gymId: true,
  direction: true,
  status: true,
  email: true,
  userId: true,
  roleToGrant: true,
  invitedById: true,
  decidedById: true,
  decidedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const

const REQUEST_INCLUDE = {
  gym: { select: { id: true, name: true, slug: true } },
  invitedBy: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
} as const

export async function findStaffInvitationsByGymId(
  gymId: string,
  status?: MembershipRequestStatus,
) {
  return prisma.gymMembershipRequest.findMany({
    where: {
      gymId,
      direction: 'STAFF_INVITED',
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: REQUEST_INCLUDE,
  })
}

export async function findPendingStaffInvitationsForUser(args: { userId: string; email: string }) {
  return prisma.gymMembershipRequest.findMany({
    where: {
      direction: 'STAFF_INVITED',
      status: 'PENDING',
      OR: [
        { userId: args.userId },
        { email: args.email.toLowerCase(), userId: null },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: REQUEST_INCLUDE,
  })
}

export async function findInvitationById(id: string) {
  return prisma.gymMembershipRequest.findUnique({
    where: { id },
    select: REQUEST_SELECT,
  })
}

export async function findExistingPendingInvitation(gymId: string, email: string) {
  return prisma.gymMembershipRequest.findFirst({
    where: {
      gymId,
      direction: 'STAFF_INVITED',
      status: 'PENDING',
      email: email.toLowerCase(),
    },
    select: REQUEST_SELECT,
  })
}

export async function createStaffInvitation(args: {
  gymId: string
  email: string
  roleToGrant: Role
  invitedById: string
  resolvedUserId: string | null
}) {
  return prisma.gymMembershipRequest.create({
    data: {
      gymId: args.gymId,
      direction: 'STAFF_INVITED',
      email: args.email.toLowerCase(),
      userId: args.resolvedUserId,
      roleToGrant: args.roleToGrant,
      invitedById: args.invitedById,
    },
    include: REQUEST_INCLUDE,
  })
}

export async function setInvitationStatus(args: {
  id: string
  status: MembershipRequestStatus
  decidedById: string
  attachUserId?: string
}) {
  return prisma.gymMembershipRequest.update({
    where: { id: args.id },
    data: {
      status: args.status,
      decidedById: args.decidedById,
      decidedAt: new Date(),
      ...(args.attachUserId ? { userId: args.attachUserId } : {}),
    },
    select: REQUEST_SELECT,
  })
}

// Resolves an email to a user record. Used during invite creation to attach
// userId when the invitee already has an account, and at signup-match time.
// Case-insensitive — auth doesn't normalize email casing at register time
// today, so an exact lowercase lookup would miss legitimate matches.
export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true },
  })
}

// Atomic accept: upsert UserGym + flip invitation status in one transaction so
// a half-completed accept never leaves a membership without an APPROVED status.
// Idempotent — a re-call updates the existing membership's role to match.
export async function acceptInvitationAndCreateMembership(args: {
  invitationId: string
  userId: string
  gymId: string
  roleToGrant: Role
}) {
  return prisma.$transaction(async (tx) => {
    await tx.userGym.upsert({
      where: { userId_gymId: { userId: args.userId, gymId: args.gymId } },
      update: { role: args.roleToGrant },
      create: { userId: args.userId, gymId: args.gymId, role: args.roleToGrant },
    })
    return tx.gymMembershipRequest.update({
      where: { id: args.invitationId },
      data: {
        status: 'APPROVED',
        decidedById: args.userId,
        decidedAt: new Date(),
        userId: args.userId,
      },
      select: REQUEST_SELECT,
    })
  })
}

// ─── Join requests (USER_REQUESTED direction, slice D2) ──────────────────────

const JOIN_REQUEST_INCLUDE = {
  gym: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
} as const

export async function findExistingPendingJoinRequest(gymId: string, userId: string) {
  return prisma.gymMembershipRequest.findFirst({
    where: {
      gymId,
      userId,
      direction: 'USER_REQUESTED',
      status: 'PENDING',
    },
    select: REQUEST_SELECT,
  })
}

export async function createJoinRequest(args: { gymId: string; userId: string }) {
  return prisma.gymMembershipRequest.create({
    data: {
      gymId: args.gymId,
      direction: 'USER_REQUESTED',
      userId: args.userId,
      // roleToGrant is irrelevant for user-requested joins (the gym decides
      // the role on approve), but the column is non-null in the schema. MEMBER
      // is a reasonable default; staff can override at approve time.
      roleToGrant: 'MEMBER',
    },
    include: JOIN_REQUEST_INCLUDE,
  })
}

export async function findPendingJoinRequestsByGymId(gymId: string) {
  return prisma.gymMembershipRequest.findMany({
    where: { gymId, direction: 'USER_REQUESTED', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: JOIN_REQUEST_INCLUDE,
  })
}

export async function findPendingJoinRequestsForUser(userId: string) {
  return prisma.gymMembershipRequest.findMany({
    where: { userId, direction: 'USER_REQUESTED', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: JOIN_REQUEST_INCLUDE,
  })
}

// Atomic approve: upsert UserGym + flip status, mirroring the accept path.
export async function approveJoinRequestAndCreateMembership(args: {
  requestId: string
  userId: string
  gymId: string
  roleToGrant: Role
  decidedById: string
}) {
  return prisma.$transaction(async (tx) => {
    await tx.userGym.upsert({
      where: { userId_gymId: { userId: args.userId, gymId: args.gymId } },
      update: { role: args.roleToGrant },
      create: { userId: args.userId, gymId: args.gymId, role: args.roleToGrant },
    })
    return tx.gymMembershipRequest.update({
      where: { id: args.requestId },
      data: {
        status: 'APPROVED',
        decidedById: args.decidedById,
        decidedAt: new Date(),
      },
      select: REQUEST_SELECT,
    })
  })
}
