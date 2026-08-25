import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { importBackupFieldsSchema } from "@/lib/validation/backup";
import { importWorkspace } from "@/lib/services/backup";
import { requireWorkspaceOwner } from "@/lib/services/workspace-auth";
import { env } from "@/lib/config/env";
import { mapBackupError } from "@/app/api/backup/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import {
  MultipartTooLargeError,
  readMultipart,
} from "@/lib/http/multipart";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapBackupError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
  } catch (error) {
    return mapBackupError(error, workspace.id);
  }

  let form;
  try {
    form = await readMultipart(request, {
      maxBodyBytes: env.BACKUP_MAX_IMPORT_BYTES + 65_536,
      maxFileBytes: env.BACKUP_MAX_IMPORT_BYTES,
      maxFiles: 1,
      maxFields: 2,
      maxParts: 3,
    });
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return jsonResponse({ error: "BACKUP_TOO_LARGE" }, { status: 413 });
    }
    return jsonResponse({ error: "BACKUP_INVALID_FILE" }, { status: 400 });
  }
  const file = form.files.find((entry) => entry.fieldName === "file");
  if (!file) {
    return jsonResponse({ error: "BACKUP_INVALID_FILE" }, { status: 400 });
  }

  const parsed = importBackupFieldsSchema.safeParse({
    passphrase: form.fields.get("passphrase"),
    mode: form.fields.get("mode"),
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const summary = await importWorkspace(workspace.id, {
      mode: parsed.data.mode,
      passphrase: parsed.data.passphrase,
      file: file.data,
    });
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "import",
      entityType: "backup",
      details: parsed.data.mode,
    });
    return jsonResponse(summary);
  } catch (error) {
    return mapBackupError(error, workspace.id);
  }
}
