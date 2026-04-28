-- AlterTable
ALTER TABLE "GymProgram" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
-- Enforce at most one default program per gym. Partial index so non-default
-- rows aren't constrained against each other.
CREATE UNIQUE INDEX "GymProgram_gym_default_key"
  ON "GymProgram"("gymId") WHERE "isDefault" = true;
