import { NextResponse, type NextRequest } from "next/server";
import * as messagesService from "@/lib/services/messages";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { sendMessageSchema } from "@/lib/validation/messagesApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ channelId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:read");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  const channel = await messagesService.getChannelForWorkspace(
    auth.workspaceId,
    channelId,
  );
  if (!channel) return apiNotFound("Channel");

  const sp = request.nextUrl.searchParams;
  const sortParam = sp.get("sort");
  const sort =
    sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  return apiJsonResponse(
    await messagesService.listMessages(auth.workspaceId, channelId, {
      cursor: sp.get("cursor") ?? undefined,
      sort,
    }),
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "messages:write");
  if (auth instanceof NextResponse) return auth;
  const { channelId } = await params;

  const parsed = sendMessageSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    // origin AGENT, so the timeline shows the message came from a token
    // rather than from an operator or a channel webhook.
    const message = await messagesService.createMessage(auth.workspaceId, {
      channelId,
      content: parsed.data.content,
      author: parsed.data.author ?? auth.tokenName,
      origin: "AGENT",
    });
    recordTokenActivity(auth, {
      action: "create",
      entityType: "message",
      entityId: message.id,
    });
    return apiJsonResponse(message, { status: 201 });
  } catch (error) {
    if (error instanceof messagesService.ChannelNotFoundError) {
      return apiNotFound("Channel");
    }
    throw error;
  }
}
