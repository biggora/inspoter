import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import { env } from "@/lib/config/env";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import { MultipartTooLargeError, readMultipart } from "@/lib/http/multipart";
import { CONTACT_PHOTO_CONTENT_TYPES } from "@/lib/contacts/model";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Photos are stored as bytes on the contact row (like mail attachments), so
// they are served from here rather than from /public. Only these types are
// accepted or returned: an SVG would be an XSS vector served same-origin.
const ALLOWED_TYPES = new Set<string>(CONTACT_PHOTO_CONTENT_TYPES);

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const photo = await contactsService.getPhoto(authResult.workspace.id, id);
  if (photo === null) {
    return jsonResponse({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  }

  // The photo changes only when the contact does, so its updatedAt is a
  // sufficient validator and saves re-sending the bytes on every list render.
  const etag = `"${id}-${photo.updatedAt.getTime()}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.data.byteLength),
      "Cache-Control": "private, max-age=0, must-revalidate",
      ETag: etag,
    },
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

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
      return jsonResponse(
        { error: "CONTACT_PHOTO_TOO_LARGE" },
        { status: 413 },
      );
    }
    return jsonResponse({ error: "CONTACT_PHOTO_INVALID" }, { status: 400 });
  }
  const file = form.files.find((entry) => entry.fieldName === "photo");
  if (!file) {
    return jsonResponse({ error: "CONTACT_PHOTO_INVALID" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.contentType)) {
    return jsonResponse(
      { error: "CONTACT_PHOTO_UNSUPPORTED_TYPE" },
      { status: 415 },
    );
  }

  try {
    await contactsService.setPhoto(
      workspace.id,
      operator.id,
      id,
      {
        contentType: file.contentType,
        data: new Uint8Array(file.data),
      },
      env.CONTACTS_MAX_PHOTO_BYTES,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "contact",
      entityId: id,
      entityLabel: null,
    });
    return emptyResponse();
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  try {
    await contactsService.clearPhoto(workspace.id, operator.id, id);
    return emptyResponse();
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
