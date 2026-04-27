-- CreateEnum
CREATE TYPE "ProgramVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "visibility" "ProgramVisibility" NOT NULL DEFAULT 'PRIVATE';
