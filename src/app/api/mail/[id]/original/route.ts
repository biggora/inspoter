import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { MailTransportError, MailboxUidValidityChangedError } from "@/lib/mail";
import mailMessages from "@/messages/en/mail.json";
import {
  getOriginalMessage,
  MailOriginalNotFoundError,
  MailOriginalTooLargeError,
  MailOriginalUnavailableError,
} from "@/lib/services/mail-original";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function downloadFilename(id: string): string {
  return `message-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.eml`;
}

function errorResponse(error: string, errorKey: string, status: number) {
  return jsonResponse({ error, errorKey }, { status });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    const source = await getOriginalMessage(id, workspace.id);
    return new Response(new Uint8Array(source), {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename="${downloadFilename(id)}"`,
        "Content-Length": String(source.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MailOriginalNotFoundError) {
      return errorResponse(
        mailMessages.errorOriginalUnavailable,
        "errorOriginalUnavailable",
        404,
      );
    }
    if (error instanceof MailOriginalUnavailableError) {
      return errorResponse(error.message, "errorOriginalUnavailable", 409);
    }
    if (error instanceof MailboxUidValidityChangedError) {
      return errorResponse(
        mailMessages.errorOriginalMailboxChanged,
        "errorOriginalMailboxChanged",
        409,
      );
    }
    if (error instanceof MailOriginalTooLargeError) {
      return errorResponse(error.message, "errorOriginalTooLarge", 413);
    }
    if (error instanceof MailTransportError) {
      return errorResponse(
        mailMessages.errorDownloadOriginal,
        "errorDownloadOriginal",
        502,
      );
    }
    return toErrorResponse(error, workspace.id);
  }
}
