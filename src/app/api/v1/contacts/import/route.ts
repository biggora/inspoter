import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiErrorResponse,
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { env } from "@/lib/config/env";
import { contactImportFieldsSchema } from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";
import {
  MultipartTooLargeError,
  readMultipart,
} from "@/lib/http/multipart";

// Static segment, so it wins over /api/v1/contacts/[contactId].
// Multipart like the browser route: the file is bytes, and the duplicate
// strategy rides alongside it as a form field.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;

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
      return apiErrorResponse(
        413,
        "PAYLOAD_TOO_LARGE",
        "The uploaded address book is larger than this workspace allows.",
      );
    }
    return apiErrorResponse(
      400,
      "VALIDATION_FAILED",
      "A multipart body with a `file` part is required.",
    );
  }
  const file = form.files.find((entry) => entry.fieldName === "file");
  if (!file) {
    return apiErrorResponse(
      400,
      "VALIDATION_FAILED",
      "A multipart body with a `file` part is required.",
    );
  }

  const parsed = contactImportFieldsSchema.safeParse({
    format: form.fields.get("format"),
    duplicateStrategy: form.fields.get("duplicateStrategy"),
  });
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  const bytes = new Uint8Array(file.data);

  try {
    const summary = await contactsService.importContacts(
      auth.workspaceId,
      null,
      bytes,
      {
        format: parsed.data.format,
        duplicateStrategy: parsed.data.duplicateStrategy,
        maxContacts: env.CONTACTS_MAX_IMPORT_ROWS,
        maxPhotoBytes: env.CONTACTS_MAX_PHOTO_BYTES,
      },
    );
    recordTokenActivity(auth, {
      action: "import",
      entityType: "contact",
      entityLabel: `${summary.created} created, ${summary.updated} updated`,
    });
    return apiJsonResponse(summary);
  } catch (error) {
    return mapContactApiError(error);
  }
}
