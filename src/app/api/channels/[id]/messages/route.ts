import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

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

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return jsonResponse(
      { error: "Содержание сообщения не может быть пустым." },
      { status: 400 },
    );
  }

  try {
    const result = await messagesService.createMessage(workspace.id, {
      channelId: id,
      content,
      author: operator.username,
    });
    return jsonResponse(result, { status: 201 });
  } catch (error) {
    if (error instanceof messagesService.ChannelNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  if (!(await channelBelongsToWorkspace(workspace.id, id))) {
    return jsonResponse({ error: "Resource not found." }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const sortParam = sp.get("sort");
  const sort =
    sortParam === "asc" ? "asc" : sortParam === "desc" ? "desc" : undefined;

  const result = await messagesService.listMessages(workspace.id, id, {
    cursor: sp.get("cursor") ?? undefined,
    sort,
  });
  return jsonResponse(result);
}
