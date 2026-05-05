-- CreateEnum
CREATE TYPE "MovementCategory" AS ENUM ('STRENGTH', 'ENDURANCE', 'MACHINE', 'GYMNASTICS', 'SKILL');

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN "category" "MovementCategory" NOT NULL DEFAULT 'STRENGTH';
