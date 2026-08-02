import { NextResponse, type NextRequest } from "next/server";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { createWebhookSchema } from "@/lib/validation/messagesApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ channelId: string }>;
}

// The created webhook's url embeds its secret and is returned exactly once —
// no-referrer keeps it out of any Referer header the caller might emit.
const SECRET_RESPONSE_HEADERS = { "Referrer-Policy": "no-referrer" };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:read");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  try {
    const webhooks = await webhookTokensService.listForChannel(
      channelId,
      auth.workspaceId,
    );
    return apiJsonResponse(webhooks, { headers: SECRET_RESPONSE_HEADERS });
  } catch (error) {
    if (error instanceof webhookTokensService.ChannelWebhookNotFoundError) {
      return apiNotFound("Channel");
    }
    throw error;
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  const parsed = createWebhookSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const created = await webhookTokensService.createForChannel(
      channelId,
      auth.workspaceId,
      parsed.data.name,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "channel_webhook",
      entityId: created.webhook.id,
      entityLabel: parsed.data.name,
    });
    return apiJsonResponse(created, {
      status: 201,
      headers: SECRET_RESPONSE_HEADERS,
    });
  } catch (error) {
    if (error instanceof webhookTokensService.ChannelWebhookNotFoundError) {
      return apiNotFound("Channel");
    }
    throw error;
  }
}
