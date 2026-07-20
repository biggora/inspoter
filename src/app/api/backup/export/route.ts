import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { exportBackupSchema } from "@/lib/validation/backup";
import { exportWorkspace } from "@/lib/services/backup";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { mapBackupError } from "@/app/api/backup/errors";
import { jsonResponse } from "@/lib/api/response";

// RFC 6266/5987: ASCII fallback in `filename`, percent-encoded UTF-8 in
// `filename*`. Duplicated from
// src/app/api/mail/[id]/attachments/[attachmentId]/route.ts (kept in sync
// manually — small enough not to warrant a shared module).
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

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapBackupError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = exportBackupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
    const { buffer, filename } = await exportWorkspace(
      workspace.id,
      parsed.data,
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return mapBackupError(error);
  }
}
