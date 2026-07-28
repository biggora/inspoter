-- MCP permission scopes on the universal API token. Existing rows default to
-- an empty array, which means "ingest only" — no MCP access.
ALTER TABLE "WebhookToken" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
