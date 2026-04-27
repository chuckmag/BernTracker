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
