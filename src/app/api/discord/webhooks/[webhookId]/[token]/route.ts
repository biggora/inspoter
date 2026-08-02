import type { NextRequest } from "next/server";
import {
  executeDiscordWebhook,
  getDiscordWebhook,
} from "@/lib/webhooks/discordPipeline";

// Discord-compatible channel webhook (specs/discord-webhook-compatibility.md).
// The credential is the path itself, exactly like the native channel route —
// reverse proxies MUST redact /api/discord/webhooks/* from their logs.

interface RouteContext {
  params: Promise<{ webhookId: string; token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { webhookId, token } = await params;
  return executeDiscordWebhook(request, webhookId, token);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { webhookId, token } = await params;
  return getDiscordWebhook(request, webhookId, token);
}
