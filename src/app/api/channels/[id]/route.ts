import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Channel workspace ownership is verified here before mutating,
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  if (!(await channelBelongsToWorkspace(workspace.id, id))) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const channel = await messagesService.renameChannel(
      id,
      workspace.id,
      parsed.data.name,
    );
    return NextResponse.json(channel);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  if (!(await channelBelongsToWorkspace(workspace.id, id))) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  try {
    await messagesService.deleteChannel(id, workspace.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
