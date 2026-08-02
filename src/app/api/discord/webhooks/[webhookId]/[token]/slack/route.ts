import type { NextRequest } from "next/server";
import { executeSlackWebhook } from "@/lib/webhooks/discordPipeline";

// Slack-compatible suffix (specs/discord-webhook-compatibility.md §2.7):
// `text` + `attachments` translated to content + embeds, `wait` defaults to
// true just like Discord's own /slack endpoint.

interface RouteContext {
  params: Promise<{ webhookId: string; token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { webhookId, token } = await params;
  return executeSlackWebhook(request, webhookId, token);
}
