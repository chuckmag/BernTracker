-- CreateTable
CREATE TABLE "MovementPR" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "repCount" INTEGER NOT NULL,
    "load" DOUBLE PRECISION NOT NULL,
    "loadUnit" "LoadUnit" NOT NULL,
    "resultId" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovementPR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovementPR_userId_movementId_idx" ON "MovementPR"("userId", "movementId");

-- CreateIndex
CREATE UNIQUE INDEX "MovementPR_userId_movementId_repCount_key" ON "MovementPR"("userId", "movementId", "repCount");

-- AddForeignKey
ALTER TABLE "MovementPR" ADD CONSTRAINT "MovementPR_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementPR" ADD CONSTRAINT "MovementPR_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovementPR" ADD CONSTRAINT "MovementPR_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result"("id") ON DELETE CASCADE ON UPDATE CASCADE;
