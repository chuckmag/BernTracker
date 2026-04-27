import { prisma, type Gender } from '@wodalytics/db'

export const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  birthday: true,
  identifiedGender: true,
  avatarUrl: true,
  onboardedAt: true,
  role: true,
} as const

export type UserProfile = {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  birthday: Date | null
  identifiedGender: Gender | null
  avatarUrl: string | null
  onboardedAt: Date | null
  role: string
}

export async function findUserProfileById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT })
}

export async function updateUserProfileById(
  userId: string,
  data: {
    firstName?: string
    lastName?: string
    birthday?: Date | null
    identifiedGender?: Gender | null
  },
) {
  return prisma.user.update({ where: { id: userId }, data, select: PROFILE_SELECT })
}

// Sets onboardedAt = now() iff the user has all required profile fields and at
// least one emergency contact, and onboardedAt is currently null. Idempotent —
// callers can invoke after any profile change without checking themselves.
export async function maybeMarkOnboarded(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      birthday: true,
      identifiedGender: true,
      onboardedAt: true,
    },
  })
  if (!user) return null
  if (user.onboardedAt) return user.onboardedAt
  if (!user.firstName || !user.lastName || !user.birthday || !user.identifiedGender) return null
  const contactCount = await prisma.emergencyContact.count({ where: { userId } })
  if (contactCount === 0) return null
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { onboardedAt: new Date() },
    select: { onboardedAt: true },
  })
  return updated.onboardedAt
}
