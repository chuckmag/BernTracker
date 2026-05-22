-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('PR_TARGET', 'FREQUENCY');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "targetDate" DATE,
    "movementId" TEXT,
    "namedWorkoutId" TEXT,
    "targetPrType" "MovementPrType",
    "targetValue" DOUBLE PRECISION,
    "targetLoadUnit" "LoadUnit",
    "targetDistanceUnit" "DistanceUnit",
    "targetRepCount" INTEGER,
    "frequencyPerWeek" INTEGER,
    "frequencyWeeks" INTEGER,
    "frequencyStartDate" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "Goal_userId_type_idx" ON "Goal"("userId", "type");

-- CreateIndex
CREATE INDEX "Goal_movementId_idx" ON "Goal"("movementId");

-- CreateIndex
CREATE INDEX "Goal_namedWorkoutId_idx" ON "Goal"("namedWorkoutId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_namedWorkoutId_fkey" FOREIGN KEY ("namedWorkoutId") REFERENCES "NamedWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
