-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "ownerUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Program_ownerUserId_key" ON "Program"("ownerUserId");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
