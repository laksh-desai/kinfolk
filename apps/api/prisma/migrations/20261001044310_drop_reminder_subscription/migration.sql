/*
  Warnings:

  - You are about to drop the `ReminderSubscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ReminderSubscription" DROP CONSTRAINT "ReminderSubscription_treeId_fkey";

-- DropForeignKey
ALTER TABLE "ReminderSubscription" DROP CONSTRAINT "ReminderSubscription_userId_fkey";

-- DropTable
DROP TABLE "ReminderSubscription";
