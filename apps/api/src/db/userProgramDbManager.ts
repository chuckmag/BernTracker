import { prisma } from '@berntracker/db'

export async function findProgramById(id: string) {
  return prisma.program.findUnique({ where: { id } })
}

export async function subscribeUserToProgram(userId: string, programId: string) {
  return prisma.userProgram.upsert({
    where: { userId_programId: { userId, programId } },
    update: {},
    create: { userId, programId },
  })
}

export async function unsubscribeUserFromProgram(userId: string, programId: string) {
  return prisma.userProgram.delete({
    where: { userId_programId: { userId, programId } },
  })
}
