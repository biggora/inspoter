-- Complete future-message filter criteria. Existing exact-sender rows remain
-- valid; new rules may use sender, subject, or both.
ALTER TABLE "MailFilterRule"
  ADD COLUMN "subjectContains" TEXT,
  ALTER COLUMN "fromAddress" DROP NOT NULL;

ALTER TABLE "MailFilterRule"
  ADD CONSTRAINT "MailFilterRule_predicate_required_check"
  CHECK (
    ("fromAddress" IS NOT NULL AND btrim("fromAddress") <> '')
    OR
    ("subjectContains" IS NOT NULL AND btrim("subjectContains") <> '')
  );
