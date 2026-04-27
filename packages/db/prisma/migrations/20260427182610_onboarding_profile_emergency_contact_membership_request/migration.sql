-- CreateEnum
CREATE TYPE "MembershipRequestDirection" AS ENUM ('STAFF_INVITED', 'USER_REQUESTED');

-- CreateEnum
CREATE TYPE "MembershipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "birthday" DATE,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymMembershipRequest" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "direction" "MembershipRequestDirection" NOT NULL,
    "status" "MembershipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT,
    "userId" TEXT,
    "roleToGrant" "Role" NOT NULL DEFAULT 'MEMBER',
    "invitedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GymMembershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmergencyContact_userId_idx" ON "EmergencyContact"("userId");

-- CreateIndex
CREATE INDEX "GymMembershipRequest_gymId_status_idx" ON "GymMembershipRequest"("gymId", "status");

-- CreateIndex
CREATE INDEX "GymMembershipRequest_userId_status_idx" ON "GymMembershipRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "GymMembershipRequest_email_status_idx" ON "GymMembershipRequest"("email", "status");

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymMembershipRequest" ADD CONSTRAINT "GymMembershipRequest_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymMembershipRequest" ADD CONSTRAINT "GymMembershipRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymMembershipRequest" ADD CONSTRAINT "GymMembershipRequest_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymMembershipRequest" ADD CONSTRAINT "GymMembershipRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill firstName / lastName from existing User.name (best-effort split on first whitespace).
-- Single-token names land entirely in firstName; multi-token names put the first token in
-- firstName and the rest (preserving middle names) in lastName.
UPDATE "User"
SET
  "firstName" = CASE
    WHEN "name" IS NULL OR btrim("name") = '' THEN NULL
    WHEN position(' ' in btrim("name")) = 0 THEN btrim("name")
    ELSE split_part(btrim("name"), ' ', 1)
  END,
  "lastName" = CASE
    WHEN "name" IS NULL OR btrim("name") = '' THEN NULL
    WHEN position(' ' in btrim("name")) = 0 THEN NULL
    ELSE btrim(substring(btrim("name") from position(' ' in btrim("name"))))
  END
WHERE "firstName" IS NULL AND "lastName" IS NULL;
