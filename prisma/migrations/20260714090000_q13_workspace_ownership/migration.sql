BEGIN;

-- Fail closed unless the signed repair has produced an unambiguous ownership graph.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "WorkspaceMember"
    WHERE "role" IS NULL OR "role" NOT IN ('owner', 'member')
  ) THEN
    RAISE EXCEPTION 'Q13 guard: WorkspaceMember roles must be lowercase owner/member';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Workspace" AS w
    WHERE NOT EXISTS (
      SELECT 1 FROM "WorkspaceMember" AS wm WHERE wm."workspaceId" = w."id"
    )
  ) OR EXISTS (
    SELECT 1 FROM "Operator" AS o
    WHERE NOT EXISTS (
      SELECT 1 FROM "WorkspaceMember" AS wm WHERE wm."operatorId" = o."id"
    )
  ) THEN
    RAISE EXCEPTION 'Q13 guard: every workspace and operator requires a membership';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Workspace" AS w
    WHERE NOT EXISTS (
      SELECT 1 FROM "WorkspaceMember" AS wm
      WHERE wm."workspaceId" = w."id" AND wm."role" = 'owner'
    )
  ) THEN
    RAISE EXCEPTION 'Q13 guard: every workspace requires an owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Session" AS s
    WHERE s."activeWorkspaceId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "WorkspaceMember" AS wm
        WHERE wm."workspaceId" = s."activeWorkspaceId"
          AND wm."operatorId" = s."operatorId"
      )
  ) THEN
    RAISE EXCEPTION 'Q13 guard: active session workspace must be an operator membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT c."workspaceId" FROM "Category" AS c
      UNION ALL SELECT mc."workspaceId" FROM "MessageCategory" AS mc
      UNION ALL SELECT mi."workspaceId" FROM "MailItem" AS mi
      UNION ALL SELECT le."workspaceId" FROM "LogEntry" AS le
      UNION ALL SELECT ac."workspaceId" FROM "AlertCategory" AS ac
      UNION ALL SELECT wt."workspaceId" FROM "WebhookToken" AS wt
    ) AS roots
    LEFT JOIN "Workspace" AS w ON w."id" = roots."workspaceId"
    WHERE roots."workspaceId" IS NULL OR w."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Q13 guard: every root must reference an existing workspace';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Bookmark" AS b
    LEFT JOIN "Category" AS c ON c."id" = b."categoryId"
    WHERE c."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "Channel" AS c
    LEFT JOIN "MessageCategory" AS mc ON mc."id" = c."messageCategoryId"
    WHERE mc."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "Message" AS m
    LEFT JOIN "Channel" AS c ON c."id" = m."channelId"
    WHERE c."id" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "IdempotencyKey" AS ik
    LEFT JOIN "WebhookToken" AS wt ON wt."id" = ik."tokenId"
    WHERE wt."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Q13 guard: repaired child rows must have valid parents';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Alert" AS a
    LEFT JOIN "AlertCategory" AS ac ON ac."id" = a."alertCategoryId"
    WHERE a."alertCategoryId" IS NULL OR ac."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Q13 guard: every alert must be attached before migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AlertCategory"
    GROUP BY "workspaceId", "name"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Q13 guard: duplicate alert category names require repair';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AlertCategory" AS ac
    WHERE (
      ac."id" LIKE 'q13-repair-uncategorized:%'
      OR ac."name" = '__q13_repair_uncategorized__'
    )
    AND NOT (
      ac."id" = 'q13-repair-uncategorized:' || ac."workspaceId"
      AND ac."name" = '__q13_repair_uncategorized__'
    )
  ) OR EXISTS (
    SELECT 1 FROM "Alert" AS a
    JOIN "AlertCategory" AS ac ON ac."id" = a."alertCategoryId"
    WHERE ac."name" = '__q13_repair_uncategorized__'
      AND ac."id" <> 'q13-repair-uncategorized:' || ac."workspaceId"
  ) THEN
    RAISE EXCEPTION 'Q13 guard: reserved alert sentinel collision';
  END IF;
END
$$;

-- Workspace membership roles
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'MEMBER');

ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceMember"
  ALTER COLUMN "role" TYPE "WorkspaceRole"
  USING (
    CASE "role"
      WHEN 'owner' THEN 'OWNER'::"WorkspaceRole"
      WHEN 'member' THEN 'MEMBER'::"WorkspaceRole"
    END
  );

-- Session active workspace is authorized by the operator's membership.
ALTER TABLE "Session" DROP CONSTRAINT "Session_activeWorkspaceId_fkey";
ALTER TABLE "Session" ADD COLUMN "activeWorkspaceOperatorId" TEXT;

UPDATE "Session"
SET "activeWorkspaceOperatorId" = "operatorId"
WHERE "activeWorkspaceId" IS NOT NULL;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_activeWorkspaceId_activeWorkspaceOperatorId_fkey"
  FOREIGN KEY ("activeWorkspaceId", "activeWorkspaceOperatorId")
  REFERENCES "WorkspaceMember"("workspaceId", "operatorId")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Parent compound identities used by workspace-safe child relations.
CREATE UNIQUE INDEX "Category_id_workspaceId_key"
  ON "Category"("id", "workspaceId");
CREATE UNIQUE INDEX "MessageCategory_id_workspaceId_key"
  ON "MessageCategory"("id", "workspaceId");
CREATE UNIQUE INDEX "AlertCategory_id_workspaceId_key"
  ON "AlertCategory"("id", "workspaceId");
CREATE UNIQUE INDEX "AlertCategory_workspaceId_name_key"
  ON "AlertCategory"("workspaceId", "name");
CREATE UNIQUE INDEX "WebhookToken_id_workspaceId_key"
  ON "WebhookToken"("id", "workspaceId");

-- Add direct ownership and parent-workspace shadows.
ALTER TABLE "Bookmark"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "categoryWorkspaceId" TEXT;
ALTER TABLE "Channel"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "messageCategoryWorkspaceId" TEXT;
ALTER TABLE "Message"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "channelWorkspaceId" TEXT;
ALTER TABLE "Alert"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "alertCategoryWorkspaceId" TEXT;
ALTER TABLE "IdempotencyKey"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "tokenWorkspaceId" TEXT;

UPDATE "Bookmark" AS child
SET "workspaceId" = parent."workspaceId",
    "categoryWorkspaceId" = parent."workspaceId"
FROM "Category" AS parent
WHERE child."categoryId" = parent."id";

UPDATE "Channel" AS child
SET "workspaceId" = parent."workspaceId",
    "messageCategoryWorkspaceId" = parent."workspaceId"
FROM "MessageCategory" AS parent
WHERE child."messageCategoryId" = parent."id";

UPDATE "Message" AS child
SET "workspaceId" = parent."workspaceId",
    "channelWorkspaceId" = parent."workspaceId"
FROM "Channel" AS parent
WHERE child."channelId" = parent."id";

UPDATE "Alert" AS child
SET "workspaceId" = parent."workspaceId",
    "alertCategoryWorkspaceId" = parent."workspaceId"
FROM "AlertCategory" AS parent
WHERE child."alertCategoryId" = parent."id";

UPDATE "IdempotencyKey" AS child
SET "workspaceId" = parent."workspaceId",
    "tokenWorkspaceId" = parent."workspaceId"
FROM "WebhookToken" AS parent
WHERE child."tokenId" = parent."id";

ALTER TABLE "Bookmark"
  ALTER COLUMN "workspaceId" SET NOT NULL,
  ALTER COLUMN "categoryWorkspaceId" SET NOT NULL;
ALTER TABLE "Channel"
  ALTER COLUMN "workspaceId" SET NOT NULL,
  ALTER COLUMN "messageCategoryWorkspaceId" SET NOT NULL;
ALTER TABLE "Message"
  ALTER COLUMN "workspaceId" SET NOT NULL,
  ALTER COLUMN "channelWorkspaceId" SET NOT NULL;
ALTER TABLE "Alert" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "IdempotencyKey"
  ALTER COLUMN "workspaceId" SET NOT NULL,
  ALTER COLUMN "tokenWorkspaceId" SET NOT NULL;

CREATE UNIQUE INDEX "Channel_id_workspaceId_key"
  ON "Channel"("id", "workspaceId");

-- Compound child relations require matching direct and parent-derived ownership.
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeWorkspace_pair_check"
  CHECK (
    ("activeWorkspaceId" IS NULL AND "activeWorkspaceOperatorId" IS NULL)
    OR (
      "activeWorkspaceId" IS NOT NULL
      AND "activeWorkspaceOperatorId" IS NOT NULL
      AND "activeWorkspaceOperatorId" = "operatorId"
    )
  );
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_categoryWorkspace_matches_workspace_check"
  CHECK ("categoryWorkspaceId" = "workspaceId");
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_messageCategoryWorkspace_matches_workspace_check"
  CHECK ("messageCategoryWorkspaceId" = "workspaceId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelWorkspace_matches_workspace_check"
  CHECK ("channelWorkspaceId" = "workspaceId");
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tokenWorkspace_matches_workspace_check"
  CHECK ("tokenWorkspaceId" = "workspaceId");
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_alertCategoryWorkspace_pair_check"
  CHECK (
    ("alertCategoryId" IS NULL AND "alertCategoryWorkspaceId" IS NULL)
    OR (
      "alertCategoryId" IS NOT NULL
      AND "alertCategoryWorkspaceId" IS NOT NULL
      AND "alertCategoryWorkspaceId" = "workspaceId"
    )
  );

-- Direct workspace ownership.
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Workspace-safe compound parent relations.
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_categoryId_categoryWorkspaceId_fkey"
  FOREIGN KEY ("categoryId", "categoryWorkspaceId")
  REFERENCES "Category"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_messageCategoryId_messageCategoryWorkspaceId_fkey"
  FOREIGN KEY ("messageCategoryId", "messageCategoryWorkspaceId")
  REFERENCES "MessageCategory"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_channelWorkspaceId_fkey"
  FOREIGN KEY ("channelId", "channelWorkspaceId")
  REFERENCES "Channel"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_alertCategoryId_alertCategoryWorkspaceId_fkey"
  FOREIGN KEY ("alertCategoryId", "alertCategoryWorkspaceId")
  REFERENCES "AlertCategory"("id", "workspaceId")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tokenId_tokenWorkspaceId_fkey"
  FOREIGN KEY ("tokenId", "tokenWorkspaceId")
  REFERENCES "WebhookToken"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Bookmark" DROP CONSTRAINT "Bookmark_categoryId_fkey";
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_messageCategoryId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT "Message_channelId_fkey";
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_alertCategoryId_fkey";
ALTER TABLE "IdempotencyKey" DROP CONSTRAINT "IdempotencyKey_tokenId_fkey";

-- Sentinel categories are repair-only. The compound FK preserves Alert.workspaceId
-- while setting both optional category columns to NULL.
DELETE FROM "AlertCategory"
WHERE "id" = 'q13-repair-uncategorized:' || "workspaceId"
  AND "name" = '__q13_repair_uncategorized__';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "AlertCategory"
    WHERE "id" LIKE 'q13-repair-uncategorized:%'
       OR "name" = '__q13_repair_uncategorized__'
  ) OR EXISTS (
    SELECT 1 FROM "Alert"
    WHERE "alertCategoryId" LIKE 'q13-repair-uncategorized:%'
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: alert repair sentinels must be fully removed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Alert"
    WHERE NOT (
      ("alertCategoryId" IS NULL AND "alertCategoryWorkspaceId" IS NULL)
      OR (
        "alertCategoryId" IS NOT NULL
        AND "alertCategoryWorkspaceId" IS NOT NULL
        AND "alertCategoryWorkspaceId" = "workspaceId"
      )
    )
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: Alert category ownership pair is invalid';
  END IF;
END
$$;

-- Replace global child/filter indexes with workspace-leading target indexes.
DROP INDEX "Category_workspaceId_idx";
DROP INDEX "Bookmark_categoryId_idx";
DROP INDEX "MessageCategory_workspaceId_idx";
DROP INDEX "Channel_messageCategoryId_idx";
DROP INDEX "Message_channelId_createdAt_id_idx";
DROP INDEX "MailItem_receivedAt_id_idx";
DROP INDEX "MailItem_sender_idx";
DROP INDEX "LogEntry_timestamp_id_idx";
DROP INDEX "LogEntry_level_idx";
DROP INDEX "LogEntry_source_idx";
DROP INDEX "AlertCategory_workspaceId_idx";
DROP INDEX "Alert_timestamp_id_idx";
DROP INDEX "Alert_alertCategoryId_idx";
DROP INDEX "Alert_severity_idx";

CREATE INDEX "Category_workspaceId_position_id_idx"
  ON "Category"("workspaceId", "position", "id");
CREATE INDEX "Bookmark_workspaceId_categoryId_position_id_idx"
  ON "Bookmark"("workspaceId", "categoryId", "position", "id");
CREATE INDEX "MessageCategory_workspaceId_createdAt_id_idx"
  ON "MessageCategory"("workspaceId", "createdAt", "id");
CREATE INDEX "Channel_workspaceId_messageCategoryId_createdAt_id_idx"
  ON "Channel"("workspaceId", "messageCategoryId", "createdAt", "id");
CREATE INDEX "Message_workspaceId_channelId_createdAt_id_idx"
  ON "Message"("workspaceId", "channelId", "createdAt", "id");
CREATE INDEX "MailItem_workspaceId_receivedAt_id_idx"
  ON "MailItem"("workspaceId", "receivedAt", "id");
CREATE INDEX "MailItem_workspaceId_sender_idx"
  ON "MailItem"("workspaceId", "sender");
CREATE INDEX "LogEntry_workspaceId_timestamp_id_idx"
  ON "LogEntry"("workspaceId", "timestamp", "id");
CREATE INDEX "LogEntry_workspaceId_level_timestamp_id_idx"
  ON "LogEntry"("workspaceId", "level", "timestamp", "id");
CREATE INDEX "LogEntry_workspaceId_source_timestamp_id_idx"
  ON "LogEntry"("workspaceId", "source", "timestamp", "id");
CREATE INDEX "Alert_workspaceId_timestamp_id_idx"
  ON "Alert"("workspaceId", "timestamp", "id");
CREATE INDEX "Alert_workspaceId_alertCategoryId_timestamp_id_idx"
  ON "Alert"("workspaceId", "alertCategoryId", "timestamp", "id");
CREATE INDEX "Alert_workspaceId_severity_timestamp_id_idx"
  ON "Alert"("workspaceId", "severity", "timestamp", "id");
CREATE INDEX "Alert_workspaceId_source_timestamp_id_idx"
  ON "Alert"("workspaceId", "source", "timestamp", "id");
CREATE INDEX "IdempotencyKey_workspaceId_tokenId_key_idx"
  ON "IdempotencyKey"("workspaceId", "tokenId", "key");

-- Provider resource ownership and operation lease metadata.
CREATE TYPE "ProviderResourceType" AS ENUM ('DOMAIN', 'SERVER');
CREATE TYPE "ProviderMode" AS ENUM ('MOCK', 'REAL');
CREATE TYPE "ProviderOperationState" AS ENUM ('IDLE', 'RUNNING', 'RECONCILE_REQUIRED');

CREATE TABLE "ProviderResourceBinding" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accountKey" TEXT NOT NULL,
  "resourceType" "ProviderResourceType" NOT NULL,
  "mode" "ProviderMode" NOT NULL,
  "remoteId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "operationState" "ProviderOperationState" NOT NULL DEFAULT 'IDLE',
  "operationId" TEXT,
  "operationKind" TEXT,
  "operationIntent" JSONB,
  "operationStartedAt" TIMESTAMP(3),
  "operationLeaseExpiresAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderResourceBinding_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProviderResourceBinding"
  ADD CONSTRAINT "ProviderResourceBinding_provider_resourceType_check"
    CHECK (
      ("resourceType" = 'DOMAIN' AND "provider" IN ('cloudflare', 'hetzner', 'godaddy'))
      OR ("resourceType" = 'SERVER' AND "provider" = 'hetzner')
    ),
  ADD CONSTRAINT "ProviderResourceBinding_accountKey_identity_check"
    CHECK (
      octet_length("accountKey") BETWEEN 1 AND 256
      AND "accountKey" = btrim("accountKey")
      AND "accountKey" !~ '[\u0001-\u001F\u007F-\u009F]'
    ),
  ADD CONSTRAINT "ProviderResourceBinding_remoteId_identity_check"
    CHECK (
      octet_length("remoteId") BETWEEN 1 AND 512
      AND "remoteId" = btrim("remoteId")
      AND "remoteId" !~ '[\u0001-\u001F\u007F-\u009F]'
    ),
  ADD CONSTRAINT "ProviderResourceBinding_displayName_identity_check"
    CHECK (
      octet_length("displayName") BETWEEN 1 AND 512
      AND "displayName" = btrim("displayName")
      AND "displayName" !~ '[\u0001-\u001F\u007F-\u009F]'
    ),
  ADD CONSTRAINT "ProviderResourceBinding_version_positive_check"
    CHECK ("version" > 0),
  ADD CONSTRAINT "ProviderResourceBinding_mode_identity_check"
    CHECK (
      (
        "mode" = 'MOCK'
        AND "accountKey" = 'mock:v1'
        AND left("remoteId", length('mock:v1:' || "workspaceId" || ':' || "provider" || ':'))
          = 'mock:v1:' || "workspaceId" || ':' || "provider" || ':'
        AND octet_length("remoteId")
          > octet_length('mock:v1:' || "workspaceId" || ':' || "provider" || ':')
      )
      OR (
        "mode" = 'REAL'
        AND left("accountKey", 5) <> 'mock:'
        AND left("remoteId", 5) <> 'mock:'
      )
    ),
  ADD CONSTRAINT "ProviderResourceBinding_operation_evidence_check"
    CHECK (
      (
        "operationState" = 'IDLE'
        AND "operationId" IS NULL
        AND "operationKind" IS NULL
        AND "operationIntent" IS NULL
        AND "operationStartedAt" IS NULL
        AND "operationLeaseExpiresAt" IS NULL
      )
      OR (
        "operationState" IN ('RUNNING', 'RECONCILE_REQUIRED')
        AND "operationId" IS NOT NULL
        AND "operationKind" IS NOT NULL
        AND "operationIntent" IS NOT NULL
        AND "operationStartedAt" IS NOT NULL
        AND "operationLeaseExpiresAt" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "ProviderResourceBinding_operation_metadata_check"
    CHECK (
      (
        "operationId" IS NULL
        OR (
          octet_length("operationId") BETWEEN 1 AND 256
          AND "operationId" = btrim("operationId")
          AND "operationId" !~ '[\u0001-\u001F\u007F-\u009F]'
        )
      )
      AND (
        "operationKind" IS NULL
        OR (
          octet_length("operationKind") BETWEEN 1 AND 256
          AND "operationKind" = btrim("operationKind")
          AND "operationKind" !~ '[\u0001-\u001F\u007F-\u009F]'
        )
      )
    ),
  ADD CONSTRAINT "ProviderResourceBinding_operation_intent_check"
    CHECK (
      "operationIntent" IS NULL
      OR (
        octet_length("operationIntent"::text) <= 16384
        AND "operationIntent"::text
          !~* '"[^"]*(api[-_]?key|token|secret|password|authorization|credential|private[-_]?key)[^"]*"[[:space:]]*:'
      )
    );

CREATE UNIQUE INDEX "ProviderResourceBinding_operationId_key"
  ON "ProviderResourceBinding"("operationId");
CREATE UNIQUE INDEX "ProviderResourceBinding_id_workspaceId_key"
  ON "ProviderResourceBinding"("id", "workspaceId");
CREATE UNIQUE INDEX "ProviderResourceBinding_provider_accountKey_resourceType_mode_remoteId_key"
  ON "ProviderResourceBinding"("provider", "accountKey", "resourceType", "mode", "remoteId");
CREATE INDEX "ProviderResourceBinding_workspaceId_resourceType_provider_mode_idx"
  ON "ProviderResourceBinding"("workspaceId", "resourceType", "provider", "mode");
CREATE INDEX "ProviderResourceBinding_operationState_operationLeaseExpiresAt_idx"
  ON "ProviderResourceBinding"("operationState", "operationLeaseExpiresAt");

ALTER TABLE "ProviderResourceBinding"
  ADD CONSTRAINT "ProviderResourceBinding_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ProviderResourceBinding" (
  "id",
  "workspaceId",
  "provider",
  "accountKey",
  "resourceType",
  "mode",
  "remoteId",
  "displayName",
  "updatedAt"
)
SELECT
  'q13-mock-binding:' || md5(w."id" || ':' || v.provider || ':' || v.resource_key),
  w."id",
  v.provider,
  'mock:v1',
  v.resource_type::"ProviderResourceType",
  'MOCK'::"ProviderMode",
  'mock:v1:' || w."id" || ':' || v.provider || ':' || v.resource_key,
  v.display_name,
  CURRENT_TIMESTAMP
FROM "Workspace" AS w
CROSS JOIN (
-- Q13_MOCK_CATALOG_VERSION: 1
-- Q13_MOCK_CATALOG_SHA256: 9300c300ac65be69ad6bf62720a6f0e16ec5e10d4a880deeed87e4da8b463f4b
-- Q13_MOCK_CATALOG_BYTE_LENGTH: 3304
-- Q13_MOCK_VALUES_BEGIN
VALUES
  ('cloudflare', 'DOMAIN', 'cf-example-com', 'example.com'),
  ('cloudflare', 'DOMAIN', 'cf-example-dev', 'example.dev'),
  ('godaddy', 'DOMAIN', 'gd-blog-app', 'blog.app'),
  ('godaddy', 'DOMAIN', 'gd-mysite-com', 'mysite.com'),
  ('godaddy', 'DOMAIN', 'gd-shop-io', 'shop.io'),
  ('hetzner', 'DOMAIN', 'hz-example-de', 'example-host.de'),
  ('hetzner', 'DOMAIN', 'hz-myserver-net', 'myserver.net'),
  ('hetzner', 'SERVER', 'srv-01', 'web-prod-01'),
  ('hetzner', 'SERVER', 'srv-02', 'web-prod-02'),
  ('hetzner', 'SERVER', 'srv-03', 'db-primary'),
  ('hetzner', 'SERVER', 'srv-04', 'db-replica'),
  ('hetzner', 'SERVER', 'srv-05', 'cache-node'),
  ('hetzner', 'SERVER', 'srv-06', 'dev-staging')
-- Q13_MOCK_VALUES_END
) AS v(provider, resource_type, resource_key, display_name)
ON CONFLICT ("provider", "accountKey", "resourceType", "mode", "remoteId")
DO NOTHING;

-- Fail closed unless the completed migration satisfies every ownership/catalog invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Workspace" AS w
    WHERE NOT EXISTS (
      SELECT 1 FROM "WorkspaceMember" AS wm WHERE wm."workspaceId" = w."id"
    )
       OR NOT EXISTS (
      SELECT 1 FROM "WorkspaceMember" AS wm
      WHERE wm."workspaceId" = w."id" AND wm."role" = 'OWNER'
    )
  ) OR EXISTS (
    SELECT 1 FROM "Operator" AS o
    WHERE NOT EXISTS (
      SELECT 1 FROM "WorkspaceMember" AS wm WHERE wm."operatorId" = o."id"
    )
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: every workspace/operator needs membership and every workspace needs an owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Session" AS s
    WHERE NOT (
      (s."activeWorkspaceId" IS NULL AND s."activeWorkspaceOperatorId" IS NULL)
      OR (
        s."activeWorkspaceId" IS NOT NULL
        AND s."activeWorkspaceOperatorId" IS NOT NULL
        AND s."activeWorkspaceOperatorId" = s."operatorId"
        AND EXISTS (
          SELECT 1 FROM "WorkspaceMember" AS wm
          WHERE wm."workspaceId" = s."activeWorkspaceId"
            AND wm."operatorId" = s."activeWorkspaceOperatorId"
        )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: session active workspace pair is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Bookmark" AS child
    WHERE child."categoryWorkspaceId" <> child."workspaceId"
       OR NOT EXISTS (
         SELECT 1 FROM "Category" AS parent
         WHERE parent."id" = child."categoryId"
           AND parent."workspaceId" = child."categoryWorkspaceId"
       )
  ) OR EXISTS (
    SELECT 1 FROM "Channel" AS child
    WHERE child."messageCategoryWorkspaceId" <> child."workspaceId"
       OR NOT EXISTS (
         SELECT 1 FROM "MessageCategory" AS parent
         WHERE parent."id" = child."messageCategoryId"
           AND parent."workspaceId" = child."messageCategoryWorkspaceId"
       )
  ) OR EXISTS (
    SELECT 1 FROM "Message" AS child
    WHERE child."channelWorkspaceId" <> child."workspaceId"
       OR NOT EXISTS (
         SELECT 1 FROM "Channel" AS parent
         WHERE parent."id" = child."channelId"
           AND parent."workspaceId" = child."channelWorkspaceId"
       )
  ) OR EXISTS (
    SELECT 1 FROM "IdempotencyKey" AS child
    WHERE child."tokenWorkspaceId" <> child."workspaceId"
       OR NOT EXISTS (
         SELECT 1 FROM "WebhookToken" AS parent
         WHERE parent."id" = child."tokenId"
           AND parent."workspaceId" = child."tokenWorkspaceId"
       )
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: child ownership shadow or compound parent is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Alert" AS a
    WHERE NOT (
      (a."alertCategoryId" IS NULL AND a."alertCategoryWorkspaceId" IS NULL)
      OR (
        a."alertCategoryId" IS NOT NULL
        AND a."alertCategoryWorkspaceId" IS NOT NULL
        AND a."alertCategoryWorkspaceId" = a."workspaceId"
        AND EXISTS (
          SELECT 1 FROM "AlertCategory" AS parent
          WHERE parent."id" = a."alertCategoryId"
            AND parent."workspaceId" = a."alertCategoryWorkspaceId"
        )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: alert category pair or compound parent is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AlertCategory"
    WHERE "id" LIKE 'q13-repair-uncategorized:%'
       OR "name" = '__q13_repair_uncategorized__'
  ) OR EXISTS (
    SELECT 1 FROM "Alert"
    WHERE "alertCategoryId" LIKE 'q13-repair-uncategorized:%'
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: alert repair sentinels remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Workspace" AS w
    WHERE (SELECT count(*) FROM "ProviderResourceBinding" AS b
           WHERE b."workspaceId" = w."id" AND b."mode" = 'MOCK' AND b."accountKey" = 'mock:v1') <> 13
       OR (SELECT count(*) FROM "ProviderResourceBinding" AS b
           WHERE b."workspaceId" = w."id" AND b."provider" = 'cloudflare' AND b."resourceType" = 'DOMAIN') <> 2
       OR (SELECT count(*) FROM "ProviderResourceBinding" AS b
           WHERE b."workspaceId" = w."id" AND b."provider" = 'hetzner' AND b."resourceType" = 'DOMAIN') <> 2
       OR (SELECT count(*) FROM "ProviderResourceBinding" AS b
           WHERE b."workspaceId" = w."id" AND b."provider" = 'godaddy' AND b."resourceType" = 'DOMAIN') <> 3
       OR (SELECT count(*) FROM "ProviderResourceBinding" AS b
           WHERE b."workspaceId" = w."id" AND b."provider" = 'hetzner' AND b."resourceType" = 'SERVER') <> 6
  ) OR (SELECT count(*) FROM "ProviderResourceBinding") <> 13 * (SELECT count(*) FROM "Workspace")
    OR EXISTS (
      SELECT 1 FROM "ProviderResourceBinding"
      WHERE "mode" <> 'MOCK' OR "accountKey" <> 'mock:v1'
    ) THEN
    RAISE EXCEPTION 'Q13 invariant: canonical mock catalog cardinality/distribution is invalid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ProviderResourceBinding"
    WHERE "operationState" <> 'IDLE'
       OR "operationId" IS NOT NULL
       OR "operationKind" IS NOT NULL
       OR "operationIntent" IS NOT NULL
       OR "operationStartedAt" IS NOT NULL
       OR "operationLeaseExpiresAt" IS NOT NULL
       OR "version" <> 1
  ) THEN
    RAISE EXCEPTION 'Q13 invariant: canonical mock bindings must start idle at version 1';
  END IF;
END
$$;

COMMIT;
