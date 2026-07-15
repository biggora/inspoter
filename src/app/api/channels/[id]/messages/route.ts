import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Channel workspace ownership is verified here before listing,
// in addition to the workspace CHECK constraint enforced at the DB layer.
async function channelBelongsToWorkspace(
  workspaceId: string,
  channelId: string,
): Promise<boolean> {
  const categories = await messagesService.listCategories(workspaceId);
  return categories.some((category) =>
    category.channels.some((channel) => channel.id === channelId),
  );
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  if (!(await channelBelongsToWorkspace(workspace.id, id))) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const sortParam = sp.get("sort");
  const sort =
    sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  const result = await messagesService.listMessages(workspace.id, id, {
    cursor: sp.get("cursor") ?? undefined,
    sort,
  });
  return NextResponse.json(result);
}
