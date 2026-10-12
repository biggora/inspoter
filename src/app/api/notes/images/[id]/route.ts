import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { getNoteImage } from "@/lib/services/note-images";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Session-authenticated and workspace-scoped. Authenticates with requireAuth()
// alone, not the X-Inspoter-Workspace header guard: the header only detects
// stale-tab mutations, and a browser <img> cannot send custom headers. The
// workspace still comes from the session and filters the query, so an unknown
// id and an id from another workspace are indistinguishable (both 404). The
// stored type comes
// from the magic-byte check at upload, and nosniff stops the browser
// second-guessing it. The bytes behind an id never change, so the response
// is immutable; "private" keeps shared caches from storing it.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth().catch((error) =>
    toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    const image = await getNoteImage(workspace.id, id);
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
    return toErrorResponse(error, workspace.id);
  }
}
