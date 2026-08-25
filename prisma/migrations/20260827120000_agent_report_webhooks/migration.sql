-- Agent run reports: a new outgoing-webhook event for a finished run, and a
-- Telegram wire format so a report can reach a chat as well as a Discord
-- channel.
--
-- Separate from 20260826120000_agents on purpose: PostgreSQL refuses to use an
-- enum value in the same transaction that adds it, and the runtime emits
-- AGENT_RUN_COMPLETED as soon as it exists. Two migrations, two transactions.
--
-- Where the Telegram credentials live, and why:
--
--   * the bot token goes into the existing AES-256-GCM payload as a
--     WEBHOOK_TELEGRAM_BOT member (src/lib/crypto/credentials.ts), exactly the
--     precedent WEBHOOK_ED25519_KEY set. It must NOT sit in "url": Telegram
--     puts the token in the request path, and "url" is plaintext and rendered
--     in the settings list.
--   * the chat id gets its own plaintext column. It is addressing, not a
--     secret, and a subscription whose target is invisible in the list is a
--     subscription nobody can audit.
--
-- "url" keeps holding the API base (https://api.telegram.org by default), so a
-- self-hosted Bot API server is a plain URL change rather than a schema one.

-- AlterEnum
ALTER TYPE "OutgoingWebhookEvent" ADD VALUE 'AGENT_RUN_COMPLETED';

-- AlterEnum
ALTER TYPE "OutgoingWebhookFormat" ADD VALUE 'TELEGRAM_BOT';

-- AlterTable
ALTER TABLE "OutgoingWebhook" ADD COLUMN "targetChatId" TEXT;
