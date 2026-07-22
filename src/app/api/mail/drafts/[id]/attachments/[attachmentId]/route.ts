import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse } from "@/lib/api/response";
import { deleteMailDraftAttachment } from "@/lib/services/mail-drafts";

interface RouteContext {
  params: Promise<{ id: string; attachmentId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id, attachmentId } = await params;

  try {
    await deleteMailDraftAttachment(id, attachmentId, workspace.id);
    return emptyResponse();
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
