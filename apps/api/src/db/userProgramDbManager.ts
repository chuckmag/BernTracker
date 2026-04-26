import { prisma, ProgramRole } from '@wodalytics/db'

export async function findProgramById(id: string) {
  return prisma.program.findUnique({ where: { id } })
}

export async function subscribeUserToProgram(
  userId: string,
  programId: string,
  role: ProgramRole = ProgramRole.MEMBER,
) {
  return prisma.userProgram.upsert({
    where: { userId_programId: { userId, programId } },
    update: { role },
    create: { userId, programId, role },
  })
}

export async function findUserProgramMembership(userId: string, programId: string) {
  return prisma.userProgram.findUnique({
    where: { userId_programId: { userId, programId } },
    select: { role: true },
  })
}

export async function unsubscribeUserFromProgram(userId: string, programId: string) {
  return prisma.userProgram.delete({
    where: { userId_programId: { userId, programId } },
  })
}
