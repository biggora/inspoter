import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Fired when a channel is opened. No ownership pre-check like the sibling
// PATCH/DELETE routes need: markChannelRead's updateMany is scoped by
// workspaceId, so another workspace's channel id simply updates nothing.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    return jsonResponse(
      await messagesService.markChannelRead(workspace.id, id),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
