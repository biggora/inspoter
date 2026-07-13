import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";

const createChannelSchema = z.object({
  categoryId: z.string().min(1, "categoryId is required"),
  name: z.string().trim().min(1, "Name is required"),
});

// messagesService.createChannel takes no workspaceId, so the target
// category's workspace ownership is verified here before creating.
async function categoryBelongsToWorkspace(workspaceId: string, categoryId: string): Promise<boolean> {
  const categories = await messagesService.listCategories(workspaceId);
  return categories.some((category) => category.id === categoryId);
}

export async function POST(request: NextRequest) {
  const { workspace } = await requireAuth();

  const body = await request.json().catch(() => null);
  const parsed = createChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  if (!(await categoryBelongsToWorkspace(workspace.id, parsed.data.categoryId))) {
    return NextResponse.json({ error: "Referenced resource does not exist." }, { status: 400 });
  }

  try {
    const channel = await messagesService.createChannel(parsed.data.categoryId, parsed.data.name);
    return NextResponse.json(channel, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
