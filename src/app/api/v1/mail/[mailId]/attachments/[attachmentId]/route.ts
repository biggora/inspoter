import { NextResponse, type NextRequest } from "next/server";
import * as mailAttachments from "@/lib/services/mail-attachments";
import { apiJsonResponse, requireApiToken } from "@/lib/api/token-auth";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ mailId: string; attachmentId: string }>;
}

// Answers JSON with the bytes base64-encoded rather than a binary stream: the
// caller is a script or an agent that wants the content inline, and the
// encoding keeps the family's single response envelope.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;
  const { mailId, attachmentId } = await params;

  try {
    const attachment = await mailAttachments.getAttachmentContent(
      mailId,
      attachmentId,
      auth.workspaceId,
    );
    return apiJsonResponse({
      filename: attachment.filename,
      contentType: attachment.contentType,
      contentBase64: attachment.content.toString("base64"),
    });
  } catch (error) {
    return mapMailError(error);
  }
}
