import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { env } from "@/lib/config/env";
import {
  MailDraftAttachmentTooLargeError,
  uploadMailDraftAttachment,
} from "@/lib/services/mail-drafts";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number(contentLength) > env.MAIL_MAX_ATTACHMENT_BYTES + 1_048_576
  ) {
    return mailActionErrorResponse(new MailDraftAttachmentTooLargeError());
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ error: "ATTACHMENT_REQUIRED" }, { status: 400 });
  }

  try {
    const content = Buffer.from(await file.arrayBuffer());
    const attachment = await uploadMailDraftAttachment(id, workspace.id, {
      filename: file.name || "attachment",
      contentType: file.type || "application/octet-stream",
      content,
    });
    return jsonResponse(attachment, { status: 201 });
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
