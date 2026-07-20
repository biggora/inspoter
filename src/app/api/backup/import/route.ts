import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { importBackupFieldsSchema } from "@/lib/validation/backup";
import { importWorkspace } from "@/lib/services/backup";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { env } from "@/lib/config/env";
import { mapBackupError } from "@/app/api/backup/errors";
import { jsonResponse } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapBackupError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
  } catch (error) {
    return mapBackupError(error);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > env.BACKUP_MAX_IMPORT_BYTES) {
    return jsonResponse({ error: "BACKUP_TOO_LARGE" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return jsonResponse({ error: "BACKUP_INVALID_FILE" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ error: "BACKUP_INVALID_FILE" }, { status: 400 });
  }

  const parsed = importBackupFieldsSchema.safeParse({
    passphrase: form.get("passphrase"),
    mode: form.get("mode"),
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > env.BACKUP_MAX_IMPORT_BYTES) {
    return jsonResponse({ error: "BACKUP_TOO_LARGE" }, { status: 413 });
  }

  try {
    const summary = await importWorkspace(workspace.id, {
      mode: parsed.data.mode,
      passphrase: parsed.data.passphrase,
      file: buffer,
    });
    return jsonResponse(summary);
  } catch (error) {
    return mapBackupError(error);
  }
}
