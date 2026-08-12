import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { listLinkTargets } from "@/lib/services/kanban-link-targets";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Fetched on demand by the card dialog's link picker rather than shipped with
// the board: the hosting list reads a provider snapshot that can trigger a
// refresh fan-out, which has no business on the board's render path.
export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  try {
    return jsonResponse(await listLinkTargets(workspace.id));
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
