import { prisma } from '@wodalytics/db'

export const EMERGENCY_CONTACT_SELECT = {
  id: true,
  userId: true,
  name: true,
  relationship: true,
  phone: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function findEmergencyContactsByUserId(userId: string) {
  return prisma.emergencyContact.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: EMERGENCY_CONTACT_SELECT,
  })
}

export async function findEmergencyContactByIdAndUserId(id: string, userId: string) {
  return prisma.emergencyContact.findFirst({
    where: { id, userId },
    select: EMERGENCY_CONTACT_SELECT,
  })
}

export async function createEmergencyContactForUser(
  userId: string,
  data: { name: string; relationship?: string; phone: string; email?: string },
) {
  return prisma.emergencyContact.create({
    data: { ...data, userId },
    select: EMERGENCY_CONTACT_SELECT,
  })
}

export async function updateEmergencyContactByIdAndUserId(
  id: string,
  userId: string,
  data: { name?: string; relationship?: string; phone?: string; email?: string },
) {
  const result = await prisma.emergencyContact.updateMany({
    where: { id, userId },
    data,
  })
  if (result.count === 0) return null
  return prisma.emergencyContact.findUnique({
    where: { id },
    select: EMERGENCY_CONTACT_SELECT,
  })
}

export async function deleteEmergencyContactByIdAndUserId(id: string, userId: string) {
  const result = await prisma.emergencyContact.deleteMany({ where: { id, userId } })
  return result.count > 0
}
