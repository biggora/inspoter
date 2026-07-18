import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { getAttachmentContent } from "@/lib/services/mail-attachments";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";

interface RouteContext {
  params: Promise<{ id: string; attachmentId: string }>;
}

// Only these content types are echoed back to the browser; everything else
// (text/html, image/svg+xml, scripts, …) downgrades to octet-stream so a
// crafted attachment can never be inline-rendered into an XSS vector.
const SAFE_CONTENT_TYPE =
  /^(text\/(plain|csv)|application\/(pdf|zip|json)|image\/(png|jpeg|gif|webp|avif)|audio\/[\w.+-]+|video\/[\w.+-]+)$/i;

function responseContentType(contentType: string): string {
  const base = contentType.split(";")[0].trim();
  return SAFE_CONTENT_TYPE.test(base) ? base : "application/octet-stream";
}

// RFC 6266/5987: ASCII fallback in `filename`, percent-encoded UTF-8 in
// `filename*` for the Cyrillic names the mailbox commonly carries.
function contentDisposition(filename: string): string {
  const ascii =
    filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") ||
    "attachment";
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Member access (same as the other reading-pane routes). Binary response —
// the client fetches with the workspace header and turns the blob into a
// programmatic download (an <a href> cannot send the header).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id, attachmentId } = await params;

  try {
    const { content, contentType, filename } = await getAttachmentContent(
      id,
      attachmentId,
      workspace.id,
    );
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": responseContentType(contentType),
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(content.byteLength),
      },
    });
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
