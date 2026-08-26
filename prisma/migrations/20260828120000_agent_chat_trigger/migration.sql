-- PostgreSQL enum additions cannot safely be consumed by later statements in
-- the same transaction on every supported server setup. Keep CHAT in its own
-- migration, then add chat rows and constraints in the following migration.
ALTER TYPE "AgentRunTrigger" ADD VALUE 'CHAT';
