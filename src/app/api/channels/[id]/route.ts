import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// messagesService.renameChannel/deleteChannel take no workspaceId, so
// workspace ownership is verified here before mutating.
async function channelBelongsToWorkspace(workspaceId: string, channelId: string): Promise<boolean> {
  const categories = await messagesService.listCategories(workspaceId);
  return categories.some((category) => category.channels.some((channel) => channel.id === channelId));
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
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
    const channel = await messagesService.renameChannel(id, parsed.data.name);
    return NextResponse.json(channel);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  if (!(await channelBelongsToWorkspace(workspace.id, id))) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  try {
    await messagesService.deleteChannel(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
