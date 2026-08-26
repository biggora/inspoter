import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { getEmbeddingStatus } from "@/lib/services/note-index";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  try {
    return jsonResponse(await getEmbeddingStatus(auth.workspace.id));
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}
