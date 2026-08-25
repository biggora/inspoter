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
import {
  MultipartTooLargeError,
  readMultipart,
} from "@/lib/http/multipart";

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

  let form;
  try {
    form = await readMultipart(request, {
      maxBodyBytes: env.MAIL_MAX_ATTACHMENT_BYTES + 65_536,
      maxFileBytes: env.MAIL_MAX_ATTACHMENT_BYTES,
      maxFiles: 1,
      maxFields: 0,
      maxParts: 1,
    });
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return mailActionErrorResponse(
        new MailDraftAttachmentTooLargeError(),
        workspace.id,
      );
    }
    return jsonResponse({ error: "ATTACHMENT_REQUIRED" }, { status: 400 });
  }
  const file = form.files.find((entry) => entry.fieldName === "file");
  if (!file) {
    return jsonResponse({ error: "ATTACHMENT_REQUIRED" }, { status: 400 });
  }

  try {
    const attachment = await uploadMailDraftAttachment(id, workspace.id, {
      filename: file.filename || "attachment",
      contentType: file.contentType || "application/octet-stream",
      content: file.data,
    });
    return jsonResponse(attachment, { status: 201 });
  } catch (error) {
    return mailActionErrorResponse(error, workspace.id);
  }
}
