import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailService from "@/lib/services/mail";
import * as mailActionsService from "@/lib/services/mail-actions";
import { patchMailItemSchema } from "@/lib/validation/mail";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

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

  const item = await mailService.getById(id, workspace.id);
  if (!item) {
    return jsonResponse({ error: "Resource not found." }, { status: 404 });
  }
  return jsonResponse(mailService.toMailDetailDto(item));
}

// Member access (no owner gate): reading-pane actions are workspace-wide.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchMailItemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    await mailActionsService.setRead(id, workspace.id, parsed.data.isRead);
    return jsonResponse({ id, isRead: parsed.data.isRead });
  } catch (error) {
    return mailActionErrorResponse(error);
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
    const result = await mailActionsService.deleteItem(id, workspace.id);
    return jsonResponse(result);
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
