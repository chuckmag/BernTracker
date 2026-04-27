-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED');

-- AlterTable: drop the old denormalized array column
ALTER TABLE "Workout" DROP COLUMN "movements";

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MovementStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutMovement" (
    "workoutId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,

    CONSTRAINT "WorkoutMovement_pkey" PRIMARY KEY ("workoutId","movementId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Movement_name_key" ON "Movement"("name");

-- CreateIndex: parentId for fast variation lookups
CREATE INDEX "Movement_parentId_idx" ON "Movement"("parentId");

-- CreateIndex: movementId for reverse FK lookups (all workouts for a movement)
CREATE INDEX "WorkoutMovement_movementId_idx" ON "WorkoutMovement"("movementId");

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutMovement" ADD CONSTRAINT "WorkoutMovement_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutMovement" ADD CONSTRAINT "WorkoutMovement_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
