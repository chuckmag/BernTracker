-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkoutType" ADD VALUE 'POWER_LIFTING';
ALTER TYPE "WorkoutType" ADD VALUE 'WEIGHT_LIFTING';
ALTER TYPE "WorkoutType" ADD VALUE 'BODY_BUILDING';
ALTER TYPE "WorkoutType" ADD VALUE 'MAX_EFFORT';
ALTER TYPE "WorkoutType" ADD VALUE 'TABATA';
ALTER TYPE "WorkoutType" ADD VALUE 'INTERVALS';
ALTER TYPE "WorkoutType" ADD VALUE 'CHIPPER';
ALTER TYPE "WorkoutType" ADD VALUE 'LADDER';
ALTER TYPE "WorkoutType" ADD VALUE 'DEATH_BY';
ALTER TYPE "WorkoutType" ADD VALUE 'RUNNING';
ALTER TYPE "WorkoutType" ADD VALUE 'ROWING';
ALTER TYPE "WorkoutType" ADD VALUE 'BIKING';
ALTER TYPE "WorkoutType" ADD VALUE 'SWIMMING';
ALTER TYPE "WorkoutType" ADD VALUE 'SKI_ERG';
ALTER TYPE "WorkoutType" ADD VALUE 'MIXED_MONO';
ALTER TYPE "WorkoutType" ADD VALUE 'GYMNASTICS';
ALTER TYPE "WorkoutType" ADD VALUE 'WEIGHTLIFTING_TECHNIQUE';
ALTER TYPE "WorkoutType" ADD VALUE 'MOBILITY';
ALTER TYPE "WorkoutType" ADD VALUE 'COOLDOWN';

-- DropForeignKey
ALTER TABLE "Movement" DROP CONSTRAINT "Movement_parentId_fkey";

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
