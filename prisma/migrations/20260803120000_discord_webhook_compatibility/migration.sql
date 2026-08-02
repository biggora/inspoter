-- Discord webhook compatibility (specs/discord-webhook-compatibility.md).
--
-- Ingress: a channel message can now carry the Discord Execute Webhook fields
-- that have no equivalent in the original {content, author} contract. All four
-- columns are nullable or defaulted, so every existing row stays valid and the
-- legacy /api/webhooks/channels route keeps writing exactly what it wrote before.
ALTER TABLE "Message" ADD COLUMN "embeds" JSONB;
ALTER TABLE "Message" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "Message" ADD COLUMN "tts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Message" ADD COLUMN "flags" INTEGER NOT NULL DEFAULT 0;

-- Egress: an outgoing webhook picks its wire format. INSPOT is the pre-existing
-- envelope + HMAC-SHA256 signature and remains the default, so no existing
-- subscription changes behaviour.
CREATE TYPE "OutgoingWebhookFormat" AS ENUM ('INSPOT', 'DISCORD_EXECUTE', 'DISCORD_EVENTS');

ALTER TABLE "OutgoingWebhook" ADD COLUMN "format" "OutgoingWebhookFormat" NOT NULL DEFAULT 'INSPOT';
ALTER TABLE "OutgoingWebhook" ADD COLUMN "publicKey" TEXT;
ALTER TABLE "OutgoingWebhook" ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
