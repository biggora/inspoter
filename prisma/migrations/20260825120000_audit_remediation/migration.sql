-- Login rate-limit state is shared by every application process.
CREATE TABLE "LoginRateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginRateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "LoginRateLimitBucket_windowStartedAt_idx"
  ON "LoginRateLimitBucket"("windowStartedAt");

-- Message names use the same normalization as the application:
-- NFKC, trim, collapsed whitespace, then lowercase.
ALTER TABLE "MessageCategory" ADD COLUMN "normalizedName" TEXT;
ALTER TABLE "Channel" ADD COLUMN "normalizedName" TEXT;

UPDATE "MessageCategory"
SET "normalizedName" = lower(
  regexp_replace(trim(normalize("name", NFKC)), '\s+', ' ', 'g')
);
UPDATE "Channel"
SET "normalizedName" = lower(
  regexp_replace(trim(normalize("name", NFKC)), '\s+', ' ', 'g')
);

-- Keep the oldest category and move all of a duplicate's channels into it.
WITH ranked AS (
  SELECT "id", "workspaceId", "normalizedName",
    first_value("id") OVER (
      PARTITION BY "workspaceId", "normalizedName"
      ORDER BY "createdAt", "id"
    ) AS canonical_id
  FROM "MessageCategory"
), duplicates AS (
  SELECT "id", "workspaceId", canonical_id
  FROM ranked WHERE "id" <> canonical_id
)
UPDATE "Channel" c
SET "messageCategoryId" = d.canonical_id
FROM duplicates d
WHERE c."messageCategoryId" = d."id"
  AND c."workspaceId" = d."workspaceId";

-- Repoint messages and tokens before removing duplicate channels.
WITH ranked AS (
  SELECT "id", "workspaceId", "messageCategoryId", "normalizedName",
    first_value("id") OVER (
      PARTITION BY "messageCategoryId", "normalizedName"
      ORDER BY "createdAt", "id"
    ) AS canonical_id
  FROM "Channel"
), duplicates AS (
  SELECT "id", "workspaceId", canonical_id
  FROM ranked WHERE "id" <> canonical_id
)
UPDATE "Message" m
SET "channelId" = d.canonical_id
FROM duplicates d
WHERE m."channelId" = d."id" AND m."workspaceId" = d."workspaceId";

WITH ranked AS (
  SELECT "id", "workspaceId", "messageCategoryId", "normalizedName",
    first_value("id") OVER (
      PARTITION BY "messageCategoryId", "normalizedName"
      ORDER BY "createdAt", "id"
    ) AS canonical_id
  FROM "Channel"
), duplicates AS (
  SELECT "id", "workspaceId", canonical_id
  FROM ranked WHERE "id" <> canonical_id
)
UPDATE "WebhookToken" t
SET "channelId" = d.canonical_id
FROM duplicates d
WHERE t."channelId" = d."id" AND t."workspaceId" = d."workspaceId";

WITH ranked AS (
  SELECT "id", "messageCategoryId", "normalizedName",
    row_number() OVER (
      PARTITION BY "messageCategoryId", "normalizedName"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "Channel"
)
DELETE FROM "Channel" c USING ranked r
WHERE c."id" = r."id" AND r.position > 1;

WITH ranked AS (
  SELECT "id",
    row_number() OVER (
      PARTITION BY "workspaceId", "normalizedName"
      ORDER BY "createdAt", "id"
    ) AS position
  FROM "MessageCategory"
)
DELETE FROM "MessageCategory" c USING ranked r
WHERE c."id" = r."id" AND r.position > 1;

ALTER TABLE "MessageCategory" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "Channel" ALTER COLUMN "normalizedName" SET NOT NULL;
CREATE UNIQUE INDEX "MessageCategory_workspaceId_normalizedName_key"
  ON "MessageCategory"("workspaceId", "normalizedName");
CREATE UNIQUE INDEX "Channel_messageCategoryId_normalizedName_key"
  ON "Channel"("messageCategoryId", "normalizedName");

ALTER TABLE "MailItem"
  ADD COLUMN "bodyTruncated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sourceSizeBytes" BIGINT;
