import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiErrorResponse,
  apiJsonResponse,
  apiNotFound,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { env } from "@/lib/config/env";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";
import { MultipartTooLargeError, readMultipart } from "@/lib/http/multipart";
import { CONTACT_PHOTO_CONTENT_TYPES } from "@/lib/contacts/model";

// Photos are stored as bytes on the contact row, so they are served from here
// rather than from /public. Only these types are accepted or returned: an SVG
// would be an XSS vector served same-origin.
const ALLOWED_TYPES = new Set<string>(CONTACT_PHOTO_CONTENT_TYPES);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ contactId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;
  const { contactId } = await params;

  const photo = await contactsService.getPhoto(auth.workspaceId, contactId);
  if (photo === null) return apiNotFound("Contact photo");

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.data.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;
  const { contactId } = await params;

  let form;
  try {
    form = await readMultipart(request, {
      maxBodyBytes: env.CONTACTS_MAX_PHOTO_BYTES + 65_536,
      maxFileBytes: env.CONTACTS_MAX_PHOTO_BYTES,
      maxFiles: 1,
      maxFields: 0,
      maxParts: 1,
    });
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return apiErrorResponse(
        413,
        "PAYLOAD_TOO_LARGE",
        "The uploaded photo is larger than this workspace allows.",
      );
    }
    return apiErrorResponse(
      400,
      "VALIDATION_FAILED",
      "A multipart body with a `photo` part is required.",
    );
  }
  const file = form.files.find((entry) => entry.fieldName === "photo");
  if (!file) {
    return apiErrorResponse(
      400,
      "VALIDATION_FAILED",
      "A multipart body with a `photo` part is required.",
    );
  }
  if (!ALLOWED_TYPES.has(file.contentType)) {
    return apiErrorResponse(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      `Supported photo types are ${[...ALLOWED_TYPES].join(", ")}.`,
    );
  }

  try {
    await contactsService.setPhoto(
      auth.workspaceId,
      null,
      contactId,
      {
        contentType: file.contentType,
        data: new Uint8Array(file.data),
      },
      env.CONTACTS_MAX_PHOTO_BYTES,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "contact",
      entityId: contactId,
    });
    return apiJsonResponse({ updated: contactId });
  } catch (error) {
    return mapContactApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;
  const { contactId } = await params;

  try {
    await contactsService.clearPhoto(auth.workspaceId, null, contactId);
    recordTokenActivity(auth, {
      action: "update",
      entityType: "contact",
      entityId: contactId,
    });
    return apiJsonResponse({ deleted: contactId });
  } catch (error) {
    return mapContactApiError(error);
  }
}
