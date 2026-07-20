import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { createOutgoingWebhookSchema } from "@/lib/validation/outgoingWebhooks";
import * as outgoingWebhooksService from "@/lib/services/outgoingWebhooks";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const webhooks = await outgoingWebhooksService.list(workspace.id);
  return jsonResponse(webhooks);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = createOutgoingWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const created = await outgoingWebhooksService.create(
      workspace.id,
      parsed.data,
    );
    return jsonResponse(created, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
