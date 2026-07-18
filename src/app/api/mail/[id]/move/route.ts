import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailActionsService from "@/lib/services/mail-actions";
import { moveMailItemSchema } from "@/lib/validation/mail";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Move a mail item into another folder of the same account (member access,
// plan §4 Phase 6). IMAP items are moved on the server first, then locally.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = moveMailItemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    await mailActionsService.moveItem(
      id,
      workspace.id,
      parsed.data.targetFolderId,
    );
    return jsonResponse({ id, folderId: parsed.data.targetFolderId });
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
