-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "LifeStatus" AS ENUM ('living', 'deceased', 'unknown');

-- CreateEnum
CREATE TYPE "TreeStatus" AS ENUM ('draft', 'in_review', 'approved', 'changes_requested');

-- CreateEnum
CREATE TYPE "UnionType" AS ENUM ('marriage', 'partnership', 'unknown');

-- CreateEnum
CREATE TYPE "UnionStatus" AS ENUM ('current', 'divorced', 'separated', 'widowed', 'ended');

-- CreateEnum
CREATE TYPE "ParentChildKind" AS ENUM ('biological', 'adopted', 'step', 'foster', 'guardian');

-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('editor', 'viewer');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('invited', 'active', 'revoked');

-- CreateEnum
CREATE TYPE "InvitationStage" AS ENUM ('sent', 'joined', 'tree_created', 'linked');

-- CreateEnum
CREATE TYPE "LinkRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "Tree" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "thumbnailUrl" TEXT,
    "focusPersonId" UUID,
    "status" "TreeStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "maidenName" TEXT,
    "nickname" TEXT,
    "suffix" TEXT,
    "gender" "Gender" NOT NULL,
    "lifeStatus" "LifeStatus" NOT NULL,
    "birthYear" INTEGER,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "birthApproximate" BOOLEAN NOT NULL DEFAULT false,
    "deathYear" INTEGER,
    "deathMonth" INTEGER,
    "deathDay" INTEGER,
    "deathApproximate" BOOLEAN NOT NULL DEFAULT false,
    "birthPlace" TEXT,
    "maritalStatus" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "photoUrl" TEXT,
    "profession" TEXT,
    "notes" TEXT,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "socials" JSONB,
    "planning" JSONB,
    "linkedTreeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Union" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "partnerAId" UUID NOT NULL,
    "partnerBId" UUID,
    "type" "UnionType" NOT NULL,
    "status" "UnionStatus" NOT NULL,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "startDay" INTEGER,
    "startApproximate" BOOLEAN NOT NULL DEFAULT false,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "endDay" INTEGER,
    "endApproximate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Union_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentChild" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "unionId" UUID NOT NULL,
    "kind" "ParentChildKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Access" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "AccessRole" NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'invited',
    "invitedById" UUID,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "stage" "InvitationStage" NOT NULL DEFAULT 'sent',
    "invitedById" UUID,
    "inviteeUserId" UUID,
    "inviteeTreeId" UUID,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "treeCreatedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkRequest" (
    "id" UUID NOT NULL,
    "fromTreeId" UUID NOT NULL,
    "toTreeId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "requestedById" UUID,
    "status" "LinkRequestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "LinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAssignment" (
    "id" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "reviewerEmail" TEXT NOT NULL,
    "reviewerUserId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSubscription" (
    "userId" UUID NOT NULL,
    "treeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSubscription_pkey" PRIMARY KEY ("userId","treeId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "treeId" UUID,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tree_ownerId_idx" ON "Tree"("ownerId");

-- CreateIndex
CREATE INDEX "Person_treeId_idx" ON "Person"("treeId");

-- CreateIndex
CREATE INDEX "Person_treeId_birthMonth_birthDay_idx" ON "Person"("treeId", "birthMonth", "birthDay");

-- CreateIndex
CREATE INDEX "Union_treeId_idx" ON "Union"("treeId");

-- CreateIndex
CREATE INDEX "Union_partnerAId_idx" ON "Union"("partnerAId");

-- CreateIndex
CREATE INDEX "Union_partnerBId_idx" ON "Union"("partnerBId");

-- CreateIndex
CREATE INDEX "ParentChild_treeId_idx" ON "ParentChild"("treeId");

-- CreateIndex
CREATE INDEX "ParentChild_unionId_idx" ON "ParentChild"("unionId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentChild_childId_unionId_key" ON "ParentChild"("childId", "unionId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentChild_childId_kind_key" ON "ParentChild"("childId", "kind");

-- CreateIndex
CREATE INDEX "Access_userId_idx" ON "Access"("userId");

-- CreateIndex
CREATE INDEX "Access_email_idx" ON "Access"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Access_treeId_email_key" ON "Access"("treeId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_treeId_idx" ON "Invitation"("treeId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "LinkRequest_toTreeId_status_idx" ON "LinkRequest"("toTreeId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_treeId_status_idx" ON "ChangeRequest"("treeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ShareLink_treeId_idx" ON "ShareLink"("treeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewAssignment_tokenHash_key" ON "ReviewAssignment"("tokenHash");

-- CreateIndex
CREATE INDEX "ReviewAssignment_treeId_idx" ON "ReviewAssignment"("treeId");

-- CreateIndex
CREATE INDEX "AuditEvent_treeId_createdAt_idx" ON "AuditEvent"("treeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetId_idx" ON "AuditEvent"("targetId");

-- AddForeignKey
ALTER TABLE "Tree" ADD CONSTRAINT "Tree_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_linkedTreeId_fkey" FOREIGN KEY ("linkedTreeId") REFERENCES "Tree"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Union" ADD CONSTRAINT "Union_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Union" ADD CONSTRAINT "Union_partnerAId_fkey" FOREIGN KEY ("partnerAId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Union" ADD CONSTRAINT "Union_partnerBId_fkey" FOREIGN KEY ("partnerBId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Access" ADD CONSTRAINT "Access_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Access" ADD CONSTRAINT "Access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Access" ADD CONSTRAINT "Access_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkRequest" ADD CONSTRAINT "LinkRequest_fromTreeId_fkey" FOREIGN KEY ("fromTreeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkRequest" ADD CONSTRAINT "LinkRequest_toTreeId_fkey" FOREIGN KEY ("toTreeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkRequest" ADD CONSTRAINT "LinkRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkRequest" ADD CONSTRAINT "LinkRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSubscription" ADD CONSTRAINT "ReminderSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSubscription" ADD CONSTRAINT "ReminderSubscription_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;
