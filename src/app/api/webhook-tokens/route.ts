import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { createWebhookTokenSchema } from "@/lib/validation/webhookTokens";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import { toErrorResponse } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const tokens = await webhookTokensService.list(workspace.id);
  return NextResponse.json(tokens);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = createWebhookTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const token = await webhookTokensService.create(
      workspace.id,
      parsed.data.name,
    );
    return NextResponse.json(token, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
