import { prisma } from '@wodalytics/db'
import type { Role } from '@wodalytics/db'

export async function findMembersWithProgramSubscriptionsByGymId(gymId: string) {
  const memberships = await prisma.userGym.findMany({
    where: { gymId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          programs: {
            where: { program: { gyms: { some: { gymId } } } },
            include: { program: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })

  return memberships.map((m) => ({
    id: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    joinedAt: m.joinedAt,
    programs: m.user.programs.map((up) => ({ id: up.program.id, name: up.program.name })),
  }))
}

export async function updateGymMemberRole(userId: string, gymId: string, role: Role) {
  return prisma.userGym.update({
    where: { userId_gymId: { userId, gymId } },
    data: { role },
  })
}

export async function removeGymMember(userId: string, gymId: string) {
  return prisma.userGym.delete({ where: { userId_gymId: { userId, gymId } } })
}

export async function findGymMembershipByUserAndGym(userId: string, gymId: string) {
  return prisma.userGym.findUnique({ where: { userId_gymId: { userId, gymId } } })
}

/**
 * Resolves an email → user (if they exist AND are a member of the given gym).
 * Returns null when either the user doesn't exist or they're in a different
 * gym. Used by the slice-3 invite endpoint to translate the operator's typed
 * email into a userId without leaking cross-gym presence.
 */
export async function findGymMemberByEmail(email: string, gymId: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  })
  if (!user) return null
  const membership = await prisma.userGym.findUnique({
    where: { userId_gymId: { userId: user.id, gymId } },
  })
  if (!membership) return null
  return user
}


export async function findGymMembershipsByUserId(userId: string) {
  const memberships = await prisma.userGym.findMany({
    where: { userId },
    include: { gym: { select: { id: true, name: true, slug: true } } },
  })
  return memberships.map((m) => ({
    id: m.gym.id,
    name: m.gym.name,
    slug: m.gym.slug,
    role: m.role,
  }))
}
