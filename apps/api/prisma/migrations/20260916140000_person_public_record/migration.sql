-- A PDF of a person's public records, pulled from a government site and attached by an ATS
-- employee (ADR 034). Stored under the tree's own file prefix, like a photo.
-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "publicRecordUrl" TEXT;
