ALTER TABLE "MailAccount"
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

WITH ranked_accounts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId"
      ORDER BY
        CASE WHEN "kind" = 'IMAP' THEN 0 ELSE 1 END,
        "createdAt" ASC,
        "id" ASC
    ) AS account_rank
  FROM "MailAccount"
)
UPDATE "MailAccount" AS account
SET "isDefault" = true
FROM ranked_accounts
WHERE account."id" = ranked_accounts."id"
  AND ranked_accounts.account_rank = 1;

CREATE UNIQUE INDEX "MailAccount_workspaceId_default_key"
ON "MailAccount" ("workspaceId")
WHERE "isDefault";
