import { NextResponse, type NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { getNoteImageForOperator } from "@/lib/services/note-images";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Session-authenticated, not the X-Inspoter-Workspace header guard: a browser
// <img> cannot send custom headers, and the stored URL
// (/api/notes/images/<id>) names no workspace. Image ids are globally unique,
// so the operator is authenticated and the image is served only when they are
// a member of the workspace that owns it. Membership is a condition of the
// query itself, so an unknown id and an image of a workspace the operator does
// not belong to are indistinguishable (both 404). Authorising by owner
// workspace, not by the session's last-used one, keeps images loading in a tab
// whose workspace differs from the one used last. The stored type comes from
// the magic-byte check at upload, and nosniff stops the browser
// second-guessing it. The bytes behind an id never change, so the response
// is immutable; "private" keeps shared caches from storing it.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireOperator().catch((error) =>
    toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const operator = authResult;
  const { id } = await params;

  try {
    const image = await getNoteImageForOperator(operator.id, id);
    if (image === null) {
      return jsonResponse({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.byteSize),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
