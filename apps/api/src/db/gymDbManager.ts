import { prisma } from '@wodalytics/db'

export async function createGymAndAddOwnerMember(
  data: { name: string; slug: string; timezone?: string },
  ownerId: string,
) {
  return prisma.$transaction(async (tx) => {
    const gym = await tx.gym.create({
      data: { name: data.name, slug: data.slug, ...(data.timezone ? { timezone: data.timezone } : {}) },
    })
    await tx.userGym.create({ data: { userId: ownerId, gymId: gym.id, role: 'OWNER' } })
    return gym
  })
}

export async function findGymById(id: string) {
  return prisma.gym.findUnique({ where: { id } })
}

export async function updateGymNameAndTimezone(id: string, data: { name?: string; timezone?: string }) {
  return prisma.gym.update({
    where: { id },
    data: { ...(data.name ? { name: data.name } : {}), ...(data.timezone ? { timezone: data.timezone } : {}) },
  })
}

// Discovery query for /gyms/browse (slice D2). Returns a lightweight gym list
// matching the search query, with member counts and the caller's relationship
// state (member? request pending?) so the UI can render the right CTA without
// a follow-up roundtrip.
export async function findGymsForBrowseAndUser(args: { search: string; userId: string }) {
  const where = args.search.trim().length > 0
    ? { name: { contains: args.search.trim(), mode: 'insensitive' as const } }
    : {}
  const [gyms, memberships, pendingRequests] = await Promise.all([
    prisma.gym.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        logoUrl: true,
        _count: { select: { members: true } },
      },
    }),
    prisma.userGym.findMany({
      where: { userId: args.userId },
      select: { gymId: true },
    }),
    prisma.gymMembershipRequest.findMany({
      where: { userId: args.userId, direction: 'USER_REQUESTED', status: 'PENDING' },
      select: { gymId: true },
    }),
  ])
  const memberGymIds = new Set(memberships.map((m) => m.gymId))
  const pendingGymIds = new Set(pendingRequests.map((r) => r.gymId))
  return gyms.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    timezone: g.timezone,
    logoUrl: g.logoUrl,
    memberCount: g._count.members,
    callerStatus: memberGymIds.has(g.id)
      ? ('MEMBER' as const)
      : pendingGymIds.has(g.id)
        ? ('REQUEST_PENDING' as const)
        : ('NONE' as const),
  }))
}
