import { prisma } from '@berntracker/db'
import type { Role } from '@berntracker/db'

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

export async function inviteUserToGymByEmail(email: string, gymId: string, role: Role) {
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } })
    if (!user) user = await tx.user.create({ data: { email } })
    const membership = await tx.userGym.upsert({
      where: { userId_gymId: { userId: user.id, gymId } },
      update: { role },
      create: { userId: user.id, gymId, role },
    })
    return { id: user.id, email: user.email, name: user.name, role: membership.role, joinedAt: membership.joinedAt }
  })
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
