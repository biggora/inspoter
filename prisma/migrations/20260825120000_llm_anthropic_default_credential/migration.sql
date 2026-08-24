-- Second LLM transport: an Anthropic-compatible endpoint
-- (POST {baseUrl}/v1/messages). Covers z.ai/GLM
-- (https://api.z.ai/api/anthropic) and Anthropic itself. Like
-- OPENAI_COMPATIBLE it adds nothing to the tables: baseUrl, model, apiKey
-- and mode live inside the existing encrypted ProviderCredential payload.
--
-- PostgreSQL allows ADD VALUE inside a transaction block; what it forbids is
-- *using* the new value before the commit. The ALTER TABLE below does not
-- use it, so both statements can share this migration. If a later edit ever
-- needs `WHERE provider = 'ANTHROPIC_COMPATIBLE'`, it must go into its own
-- migration directory.
ALTER TYPE "ProviderType" ADD VALUE 'ANTHROPIC_COMPATIBLE';

-- The workspace's active LLM provider. Until now src/lib/llm/registry.ts
-- took "the oldest credential", which made the choice depend on insert
-- order once more than one was configured. The flag makes it explicit;
-- without it the behavior is unchanged, so no backfill is needed and none
-- is done.
--
-- "One default per category" is deliberately NOT expressed in SQL: the
-- category (DNS/HOSTING/LLM) lives in src/lib/providers/registry.ts, not in
-- the database. The invariant is held by
-- credentialsService.setDefaultCredential() inside a transaction.
ALTER TABLE "ProviderCredential"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
