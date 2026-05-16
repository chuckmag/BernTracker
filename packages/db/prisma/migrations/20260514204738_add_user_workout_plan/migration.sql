-- CreateTable
CREATE TABLE "UserWorkoutPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "level" "WorkoutLevel",
    "value" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWorkoutPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserWorkoutPlan_userId_workoutId_key" ON "UserWorkoutPlan"("userId", "workoutId");

-- CreateIndex
CREATE INDEX "UserWorkoutPlan_workoutId_idx" ON "UserWorkoutPlan"("workoutId");

-- AddForeignKey
ALTER TABLE "UserWorkoutPlan" ADD CONSTRAINT "UserWorkoutPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorkoutPlan" ADD CONSTRAINT "UserWorkoutPlan_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorkoutPlan" ADD CONSTRAINT "UserWorkoutPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
