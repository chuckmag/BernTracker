-- CreateEnum
CREATE TYPE "ProgramRole" AS ENUM ('MEMBER', 'PROGRAMMER');

-- AlterTable
ALTER TABLE "UserProgram" ADD COLUMN     "role" "ProgramRole" NOT NULL DEFAULT 'MEMBER';
