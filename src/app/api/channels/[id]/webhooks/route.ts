import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { createChannelWebhookSchema } from "@/lib/validation/webhookTokens";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SECRET_RESPONSE_HEADERS = { "Referrer-Policy": "no-referrer" };

function notFoundResponse() {
  return jsonResponse({ error: "Resource not found." }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    const webhooks = await webhookTokensService.listForChannel(
      id,
      authResult.workspace.id,
    );
    return jsonResponse(webhooks, { headers: SECRET_RESPONSE_HEADERS });
  } catch (error) {
    if (error instanceof webhookTokensService.ChannelWebhookNotFoundError) {
      return notFoundResponse();
    }
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = createChannelWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const created = await webhookTokensService.createForChannel(
      id,
      authResult.workspace.id,
      parsed.data.name,
    );
    return jsonResponse(created, {
      status: 201,
      headers: SECRET_RESPONSE_HEADERS,
    });
  } catch (error) {
    if (error instanceof webhookTokensService.ChannelWebhookNotFoundError) {
      return notFoundResponse();
    }
    return toErrorResponse(error);
  }
}
