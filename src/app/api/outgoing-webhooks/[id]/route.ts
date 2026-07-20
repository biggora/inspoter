import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateOutgoingWebhookSchema } from "@/lib/validation/outgoingWebhooks";
import * as outgoingWebhooksService from "@/lib/services/outgoingWebhooks";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse, emptyResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const webhook = await outgoingWebhooksService.get(id, workspace.id);
  if (!webhook) {
    return jsonResponse({ error: "OUTGOING_WEBHOOK_NOT_FOUND" }, { status: 404 });
  }
  return jsonResponse(webhook);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateOutgoingWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const updated = await outgoingWebhooksService.update(
      id,
      workspace.id,
      parsed.data,
    );
    return jsonResponse(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    await outgoingWebhooksService.remove(id, workspace.id);
    return emptyResponse();
  } catch (error) {
    return toErrorResponse(error);
  }
}
