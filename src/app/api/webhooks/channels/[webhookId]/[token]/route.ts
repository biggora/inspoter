import type { NextRequest } from "next/server";
import { processChannelWebhook } from "@/lib/webhooks/channelPipeline";

interface RouteContext {
  params: Promise<{ webhookId: string; token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { webhookId, token } = await params;
  return processChannelWebhook(request, webhookId, token);
}
