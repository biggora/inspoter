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

// Photos are stored as bytes on the contact row, so they are served from here
// rather than from /public. Only these types are accepted or returned: an SVG
// would be an XSS vector served same-origin.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

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

  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number(contentLength) > env.CONTACTS_MAX_PHOTO_BYTES * 2
  ) {
    return apiErrorResponse(
      413,
      "PAYLOAD_TOO_LARGE",
      "The uploaded photo is larger than this workspace allows.",
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return apiErrorResponse(
      400,
      "VALIDATION_FAILED",
      "A multipart body with a `photo` part is required.",
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
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
        contentType: file.type,
        data: new Uint8Array(await file.arrayBuffer()),
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
