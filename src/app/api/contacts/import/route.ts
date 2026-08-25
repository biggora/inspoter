import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import { env } from "@/lib/config/env";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import { contactImportFieldsSchema } from "@/lib/validation/contacts";
import { MultipartTooLargeError, readMultipart } from "@/lib/http/multipart";

// Multipart, like /api/backup/import: the file is bytes, and the duplicate
// strategy rides alongside it as a form field rather than in the query string.
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  let form;
  try {
    form = await readMultipart(request, {
      maxBodyBytes: env.CONTACTS_MAX_IMPORT_BYTES + 65_536,
      maxFileBytes: env.CONTACTS_MAX_IMPORT_BYTES,
      maxFiles: 1,
      maxFields: 2,
      maxParts: 3,
    });
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return jsonResponse(
        { error: "CONTACT_IMPORT_TOO_LARGE" },
        { status: 413 },
      );
    }
    return jsonResponse(
      { error: "CONTACT_IMPORT_INVALID_FILE" },
      { status: 400 },
    );
  }
  const file = form.files.find((entry) => entry.fieldName === "file");
  if (!file) {
    return jsonResponse(
      { error: "CONTACT_IMPORT_INVALID_FILE" },
      { status: 400 },
    );
  }

  const parsed = contactImportFieldsSchema.safeParse({
    format: form.fields.get("format"),
    duplicateStrategy: form.fields.get("duplicateStrategy"),
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const bytes = new Uint8Array(file.data);

  try {
    const summary = await contactsService.importContacts(
      workspace.id,
      operator.id,
      bytes,
      {
        format: parsed.data.format,
        duplicateStrategy: parsed.data.duplicateStrategy,
        maxContacts: env.CONTACTS_MAX_IMPORT_ROWS,
        maxPhotoBytes: env.CONTACTS_MAX_PHOTO_BYTES,
      },
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "import",
      entityType: "contact",
      entityId: null,
      entityLabel: null,
      details: JSON.stringify(summary),
    });
    return jsonResponse(summary);
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
