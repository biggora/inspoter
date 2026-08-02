-- Messages written by an API token (MCP tools or /api/v1/messages/**) are
-- neither operator-authored nor webhook ingest, so the timeline can label
-- them separately. The new value is not used in this migration, so the
-- PostgreSQL restriction on using a freshly added enum value inside the
-- same transaction does not apply.
ALTER TYPE "MessageOrigin" ADD VALUE 'AGENT';
