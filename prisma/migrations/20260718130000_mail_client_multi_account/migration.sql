-- Multi-account mail client, Phase 1 (plan: mail-sorted-avalanche §1).
-- Hand-ordered migration: create enums/tables -> backfill one WEBHOOK account
-- + INBOX folder per existing workspace -> rename MailItem columns -> add new
-- MailItem columns (FKs nullable) -> backfill FKs/isRead/snippet -> SET NOT
-- NULL -> indexes + foreign keys + raw partial unique index.

-- CreateEnum
CREATE TYPE "MailAccountKind" AS ENUM ('WEBHOOK', 'IMAP');

-- CreateEnum
CREATE TYPE "MailSecurity" AS ENUM ('SSL', 'STARTTLS');

-- CreateEnum
CREATE TYPE "MailSyncStatus" AS ENUM ('IDLE', 'SYNCING', 'ERROR');

-- CreateEnum
CREATE TYPE "MailSpecialUse" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'TRASH', 'JUNK', 'ARCHIVE', 'OTHER');

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "MailAccountKind" NOT NULL,
    "mode" "ProviderMode" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecurity" "MailSecurity",
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecurity" "MailSecurity",
    "username" TEXT,
    "encryptedData" TEXT,
    "iv" TEXT,
    "authTag" TEXT,
    "maskedHint" TEXT,
    "isValid" BOOLEAN,
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" "MailSyncStatus" NOT NULL DEFAULT 'IDLE',
    "syncError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "syncLeaseExpiresAt" TIMESTAMP(3),
    "syncIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountWorkspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "delimiter" TEXT,
    "specialUse" "MailSpecialUse" NOT NULL DEFAULT 'OTHER',
    "position" INTEGER NOT NULL DEFAULT 0,
    "uidValidity" BIGINT,
    "lastSeenUid" BIGINT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAttachment" (
    "id" TEXT NOT NULL,
    "mailItemId" TEXT NOT NULL,
    "partId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentId" TEXT,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "content" BYTEA,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailAttachment_pkey" PRIMARY KEY ("id")
);

-- Backfill: one system WEBHOOK account per existing workspace.
INSERT INTO "MailAccount" ("id", "workspaceId", "kind", "mode", "name", "email", "syncStatus", "updatedAt")
SELECT gen_random_uuid()::text, w."id", 'WEBHOOK', 'REAL', 'Webhook', '', 'IDLE', CURRENT_TIMESTAMP
FROM "Workspace" w;

-- Backfill: one INBOX folder per webhook account.
INSERT INTO "MailFolder" ("id", "workspaceId", "accountId", "accountWorkspaceId", "path", "name", "specialUse", "position", "updatedAt")
SELECT gen_random_uuid()::text, a."workspaceId", a."id", a."workspaceId", 'INBOX', 'Входящие', 'INBOX', 0, CURRENT_TIMESTAMP
FROM "MailAccount" a
WHERE a."kind" = 'WEBHOOK';

-- AlterTable: rename existing MailItem columns (data-preserving).
ALTER TABLE "MailItem" RENAME COLUMN "sender" TO "fromAddress";
ALTER TABLE "MailItem" RENAME COLUMN "body" TO "bodyText";

-- AlterTable: new MailItem columns; FK columns start nullable for backfill.
ALTER TABLE "MailItem" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "accountWorkspaceId" TEXT,
ADD COLUMN     "bccRecipients" JSONB,
ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "ccRecipients" JSONB,
ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "folderWorkspaceId" TEXT,
ADD COLUMN     "fromName" TEXT,
ADD COLUMN     "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAnswered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "replyToAddress" TEXT,
ADD COLUMN     "snippet" TEXT,
ADD COLUMN     "toRecipients" JSONB,
ADD COLUMN     "uid" BIGINT;

-- Backfill: attach existing items to the workspace's webhook account/INBOX,
-- mark them read, derive snippet from the (renamed) text body.
UPDATE "MailItem" m
SET "accountId" = a."id",
    "accountWorkspaceId" = a."workspaceId",
    "folderId" = f."id",
    "folderWorkspaceId" = f."workspaceId",
    "isRead" = true,
    "snippet" = left(m."bodyText", 120)
FROM "MailAccount" a
JOIN "MailFolder" f ON f."accountId" = a."id" AND f."path" = 'INBOX'
WHERE a."workspaceId" = m."workspaceId" AND a."kind" = 'WEBHOOK';

-- AlterTable: FK columns are now fully backfilled.
ALTER TABLE "MailItem" ALTER COLUMN "accountId" SET NOT NULL,
ALTER COLUMN "accountWorkspaceId" SET NOT NULL,
ALTER COLUMN "folderId" SET NOT NULL,
ALTER COLUMN "folderWorkspaceId" SET NOT NULL;

-- DropIndex
DROP INDEX "MailItem_workspaceId_sender_idx";

-- CreateIndex
CREATE INDEX "MailAccount_workspaceId_idx" ON "MailAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "MailAccount_isActive_nextSyncAt_idx" ON "MailAccount"("isActive", "nextSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_id_workspaceId_key" ON "MailAccount"("id", "workspaceId");

-- CreateIndex (raw partial unique: at most one WEBHOOK account per workspace;
-- not representable in the Prisma schema — see MailAccount model comment)
CREATE UNIQUE INDEX "MailAccount_workspaceId_webhook_key" ON "MailAccount"("workspaceId") WHERE "kind" = 'WEBHOOK';

-- CreateIndex
CREATE INDEX "MailFolder_workspaceId_idx" ON "MailFolder"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailFolder_id_workspaceId_key" ON "MailFolder"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MailFolder_accountId_path_key" ON "MailFolder"("accountId", "path");

-- CreateIndex
CREATE INDEX "MailAttachment_mailItemId_idx" ON "MailAttachment"("mailItemId");

-- CreateIndex
CREATE INDEX "MailItem_workspaceId_fromAddress_idx" ON "MailItem"("workspaceId", "fromAddress");

-- CreateIndex
CREATE INDEX "MailItem_workspaceId_accountId_folderId_receivedAt_id_idx" ON "MailItem"("workspaceId", "accountId", "folderId", "receivedAt", "id");

-- CreateIndex
CREATE INDEX "MailItem_workspaceId_accountId_folderId_isRead_idx" ON "MailItem"("workspaceId", "accountId", "folderId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "MailItem_folderId_uid_key" ON "MailItem"("folderId", "uid");

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailFolder" ADD CONSTRAINT "MailFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailFolder" ADD CONSTRAINT "MailFolder_accountId_accountWorkspaceId_fkey" FOREIGN KEY ("accountId", "accountWorkspaceId") REFERENCES "MailAccount"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailItem" ADD CONSTRAINT "MailItem_accountId_accountWorkspaceId_fkey" FOREIGN KEY ("accountId", "accountWorkspaceId") REFERENCES "MailAccount"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailItem" ADD CONSTRAINT "MailItem_folderId_folderWorkspaceId_fkey" FOREIGN KEY ("folderId", "folderWorkspaceId") REFERENCES "MailFolder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttachment" ADD CONSTRAINT "MailAttachment_mailItemId_fkey" FOREIGN KEY ("mailItemId") REFERENCES "MailItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
