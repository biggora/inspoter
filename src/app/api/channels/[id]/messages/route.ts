import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";

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
  const { workspace } = await requireAuth();
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
