import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { MultipartTooLargeError, readMultipart } from "@/lib/http/multipart";
import { NOTE_IMAGE_MAX_BYTES } from "@/lib/notes/images";
import {
  NoteImageInvalidError,
  NoteImageTooLargeError,
  NoteImageUnsupportedTypeError,
  createNoteImage,
} from "@/lib/services/note-images";

// Uploads one image and returns the markdown to embed it. The file's declared
// content type and name are ignored: createNoteImage decides the type from the
// bytes. The editor sets the alt text itself, so the markdown is built with an
// empty one.
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  let form;
  try {
    form = await readMultipart(request, {
      maxBodyBytes: NOTE_IMAGE_MAX_BYTES + 65_536,
      // One past the limit: busboy trips its fileSize limit when a file REACHES
      // it, so a file of exactly NOTE_IMAGE_MAX_BYTES would be rejected.
      // createNoteImage makes the exact check. Memory stays bounded by
      // maxBodyBytes.
      maxFileBytes: NOTE_IMAGE_MAX_BYTES + 1,
      maxFiles: 1,
      maxFields: 0,
      maxParts: 1,
    });
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return jsonResponse({ error: "NOTE_IMAGE_TOO_LARGE" }, { status: 413 });
    }
    return jsonResponse({ error: "NOTE_IMAGE_INVALID" }, { status: 400 });
  }
  const file = form.files.find((entry) => entry.fieldName === "file");
  if (!file) {
    return jsonResponse({ error: "NOTE_IMAGE_INVALID" }, { status: 400 });
  }

  try {
    const image = await createNoteImage(workspace.id, {
      bytes: new Uint8Array(file.data),
    });
    return jsonResponse(image, { status: 201 });
  } catch (error) {
    if (error instanceof NoteImageTooLargeError) {
      return jsonResponse({ error: error.code }, { status: 413 });
    }
    if (error instanceof NoteImageUnsupportedTypeError) {
      return jsonResponse({ error: error.code }, { status: 415 });
    }
    if (error instanceof NoteImageInvalidError) {
      return jsonResponse({ error: error.code }, { status: 400 });
    }
    return toErrorResponse(error, workspace.id);
  }
}
