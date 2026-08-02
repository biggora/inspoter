-- Alert category provenance + case-folded category names.
--
-- Two changes that belong together: an alert now records WHO chose its
-- category (so a later classifier cannot overwrite an operator silently), and
-- AlertCategory gains the normalizedName encoding MailLabel/ServiceLabel
-- already use (so "availability", "Availability" and "AVAILABILITY " from
-- three third-party senders stop producing three categories).
--
-- The merge below is the one destructive step: categories that differ only in
-- case are collapsed into the oldest of the group. It runs before the unique
-- index is created, because the index is exactly what would otherwise fail.

-- 1. AlertCategory columns, nullable for now so existing rows survive.
ALTER TABLE "AlertCategory" ADD COLUMN "normalizedName" TEXT;
ALTER TABLE "AlertCategory" ADD COLUMN "description" TEXT;

-- 2. Backfill. SQL cannot do the NFKC pass that normalizeLabelName() applies
-- in the app, so this is trim + whitespace collapse + lowercase; any residual
-- NFKC difference stays a separate category until renamed, which is the same
-- outcome the mail labels have.
UPDATE "AlertCategory"
SET "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'));

-- 3. Repoint alerts of the losing duplicates onto the keeper (oldest row of
-- each workspace+normalizedName group), then delete the losers. Order
-- matters: no alert may reference a row that is about to disappear.
UPDATE "Alert" a
SET "alertCategoryId" = k."id"
FROM "AlertCategory" c
JOIN LATERAL (
    SELECT k2."id"
    FROM "AlertCategory" k2
    WHERE k2."workspaceId" = c."workspaceId"
      AND k2."normalizedName" = c."normalizedName"
    ORDER BY k2."createdAt", k2."id"
    LIMIT 1
) k ON TRUE
WHERE a."alertCategoryId" = c."id"
  AND a."alertCategoryWorkspaceId" = c."workspaceId"
  AND k."id" <> c."id";

DELETE FROM "AlertCategory" c
WHERE EXISTS (
    SELECT 1
    FROM "AlertCategory" k
    WHERE k."workspaceId" = c."workspaceId"
      AND k."normalizedName" = c."normalizedName"
      AND (k."createdAt", k."id") < (c."createdAt", c."id")
);

-- 4. Enforce.
ALTER TABLE "AlertCategory" ALTER COLUMN "normalizedName" SET NOT NULL;

-- DropIndex
DROP INDEX "AlertCategory_workspaceId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "AlertCategory_workspaceId_normalizedName_key" ON "AlertCategory"("workspaceId", "normalizedName");

-- 5. Alert provenance columns.
-- CreateEnum
CREATE TYPE "AlertCategorySource" AS ENUM ('WEBHOOK', 'MANUAL', 'RULE', 'MODEL');

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "categorySource" "AlertCategorySource";
ALTER TABLE "Alert" ADD COLUMN "categoryConfidence" DOUBLE PRECISION;

-- Everything that already has a category got it at ingest time: either from a
-- webhook payload or from an internal producer using the same entry point.
UPDATE "Alert"
SET "categorySource" = 'WEBHOOK'
WHERE "alertCategoryId" IS NOT NULL;
