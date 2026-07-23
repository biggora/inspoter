import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

const createChannelSchema = z.object({
  categoryId: z.string().min(1, "categoryId is required"),
  name: z.string().trim().min(1, "Name is required"),
});

// Category workspace ownership is verified here before creating,
// in addition to the workspace CHECK constraint enforced at the DB layer.
async function categoryBelongsToWorkspace(
  workspaceId: string,
  categoryId: string,
): Promise<boolean> {
  const categories = await messagesService.listCategories(workspaceId);
  return categories.some((category) => category.id === categoryId);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = createChannelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  if (
    !(await categoryBelongsToWorkspace(workspace.id, parsed.data.categoryId))
  ) {
    return jsonResponse(
      { error: "Referenced resource does not exist." },
      { status: 400 },
    );
  }

  try {
    const channel = await messagesService.createChannel(
      workspace.id,
      parsed.data.categoryId,
      parsed.data.name,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "channel",
      entityId: channel.id,
    });
    return jsonResponse(channel, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
