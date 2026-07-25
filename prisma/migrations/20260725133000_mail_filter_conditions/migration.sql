-- Extensible mail-filter conditions. Existing sender/subject rules and
-- historical runs are migrated in place; legacy columns stay readable for
-- backward-compatible API clients during rollout.

CREATE TYPE "MailFilterMatchMode" AS ENUM ('ALL', 'ANY');
CREATE TYPE "MailFilterConditionField" AS ENUM (
  'FROM_ADDRESS',
  'FROM_DOMAIN',
  'RECIPIENT',
  'SUBJECT',
  'BODY',
  'HAS_ATTACHMENT'
);
CREATE TYPE "MailFilterConditionOperator" AS ENUM (
  'EQUALS',
  'CONTAINS',
  'IS'
);

ALTER TABLE "MailFilterRule"
  ADD COLUMN "matchMode" "MailFilterMatchMode" NOT NULL DEFAULT 'ALL';

CREATE TABLE "MailFilterCondition" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleWorkspaceId" TEXT NOT NULL,
  "field" "MailFilterConditionField" NOT NULL,
  "operator" "MailFilterConditionOperator" NOT NULL,
  "value" TEXT NOT NULL,
  "isNegated" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "MailFilterCondition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MailFilterCondition_workspace_consistency_check"
    CHECK ("workspaceId" = "ruleWorkspaceId"),
  CONSTRAINT "MailFilterCondition_value_check"
    CHECK (btrim("value") <> '' AND char_length("value") <= 500),
  CONSTRAINT "MailFilterCondition_position_check"
    CHECK ("position" >= 0 AND "position" < 10),
  CONSTRAINT "MailFilterCondition_operator_check"
    CHECK (
      ("field" = 'FROM_ADDRESS' AND "operator" IN ('EQUALS', 'CONTAINS'))
      OR ("field" = 'FROM_DOMAIN' AND "operator" = 'EQUALS')
      OR ("field" = 'RECIPIENT' AND "operator" IN ('EQUALS', 'CONTAINS'))
      OR ("field" = 'SUBJECT' AND "operator" IN ('EQUALS', 'CONTAINS'))
      OR ("field" = 'BODY' AND "operator" = 'CONTAINS')
      OR (
        "field" = 'HAS_ATTACHMENT'
        AND "operator" = 'IS'
        AND lower("value") IN ('true', 'false')
      )
    )
);

CREATE UNIQUE INDEX "MailFilterCondition_id_workspaceId_key"
  ON "MailFilterCondition"("id", "workspaceId");
CREATE UNIQUE INDEX "MailFilterCondition_ruleId_position_key"
  ON "MailFilterCondition"("ruleId", "position");
CREATE INDEX "MailFilterCondition_workspaceId_ruleId_position_id_idx"
  ON "MailFilterCondition"("workspaceId", "ruleId", "position", "id");

INSERT INTO "MailFilterCondition" (
  "id",
  "workspaceId",
  "ruleId",
  "ruleWorkspaceId",
  "field",
  "operator",
  "value",
  "position"
)
SELECT
  'mfc_' || md5("id" || ':from'),
  "workspaceId",
  "id",
  "workspaceId",
  'FROM_ADDRESS'::"MailFilterConditionField",
  'EQUALS'::"MailFilterConditionOperator",
  btrim("fromAddress"),
  0
FROM "MailFilterRule"
WHERE "fromAddress" IS NOT NULL AND btrim("fromAddress") <> '';

INSERT INTO "MailFilterCondition" (
  "id",
  "workspaceId",
  "ruleId",
  "ruleWorkspaceId",
  "field",
  "operator",
  "value",
  "position"
)
SELECT
  'mfc_' || md5("id" || ':subject'),
  "workspaceId",
  "id",
  "workspaceId",
  'SUBJECT'::"MailFilterConditionField",
  'CONTAINS'::"MailFilterConditionOperator",
  btrim("subjectContains"),
  CASE
    WHEN "fromAddress" IS NOT NULL AND btrim("fromAddress") <> '' THEN 1
    ELSE 0
  END
FROM "MailFilterRule"
WHERE "subjectContains" IS NOT NULL AND btrim("subjectContains") <> '';

ALTER TABLE "MailFilterCondition"
  ADD CONSTRAINT "MailFilterCondition_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailFilterCondition"
  ADD CONSTRAINT "MailFilterCondition_ruleId_ruleWorkspaceId_fkey"
  FOREIGN KEY ("ruleId", "ruleWorkspaceId")
  REFERENCES "MailFilterRule"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailFilterRule"
  DROP CONSTRAINT "MailFilterRule_predicate_required_check";

ALTER TABLE "MailFilterRun"
  ADD COLUMN "snapshotMatchMode" "MailFilterMatchMode" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "snapshotConditions" JSONB;

UPDATE "MailFilterRun"
SET "snapshotConditions" =
  CASE
    WHEN "snapshotFromAddress" IS NOT NULL
      AND btrim("snapshotFromAddress") <> ''
      AND "snapshotSubjectContains" IS NOT NULL
      AND btrim("snapshotSubjectContains") <> ''
    THEN jsonb_build_array(
      jsonb_build_object(
        'field', 'FROM_ADDRESS',
        'operator', 'EQUALS',
        'value', btrim("snapshotFromAddress"),
        'isNegated', false
      ),
      jsonb_build_object(
        'field', 'SUBJECT',
        'operator', 'CONTAINS',
        'value', btrim("snapshotSubjectContains"),
        'isNegated', false
      )
    )
    WHEN "snapshotFromAddress" IS NOT NULL
      AND btrim("snapshotFromAddress") <> ''
    THEN jsonb_build_array(
      jsonb_build_object(
        'field', 'FROM_ADDRESS',
        'operator', 'EQUALS',
        'value', btrim("snapshotFromAddress"),
        'isNegated', false
      )
    )
    ELSE jsonb_build_array(
      jsonb_build_object(
        'field', 'SUBJECT',
        'operator', 'CONTAINS',
        'value', btrim("snapshotSubjectContains"),
        'isNegated', false
      )
    )
  END;

ALTER TABLE "MailFilterRun"
  ALTER COLUMN "snapshotConditions" SET NOT NULL,
  ALTER COLUMN "snapshotConditions" SET DEFAULT '[]'::jsonb;

ALTER TABLE "MailFilterRun"
  DROP CONSTRAINT "MailFilterRun_snapshot_predicate_check";

ALTER TABLE "MailFilterRun"
  ADD CONSTRAINT "MailFilterRun_snapshot_conditions_check"
  CHECK (
    jsonb_typeof("snapshotConditions") = 'array'
    AND jsonb_array_length("snapshotConditions") > 0
    AND jsonb_array_length("snapshotConditions") <= 10
  );
