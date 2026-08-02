import { unknownWebhookSuffix } from "@/lib/webhooks/discordPipeline";

// Discord exposes a /github suffix that renders GitHub event payloads. Inspoter
// does not implement it; answering with the Discord-shaped 10015 body is far
// clearer to a misconfigured sender than Next.js's HTML 404
// (specs/discord-webhook-compatibility.md §2.1).
export async function POST() {
  return unknownWebhookSuffix();
}
