-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "externalSourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workout_externalSourceId_key" ON "Workout"("externalSourceId");
