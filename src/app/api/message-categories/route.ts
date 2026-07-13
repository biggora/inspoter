import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/dal";
import * as messagesService from "@/lib/services/messages";
import { toErrorResponse } from "@/lib/api/errors";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export async function GET() {
  const { workspace } = await requireAuth();
  const categories = await messagesService.listCategories(workspace.id);
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const { workspace } = await requireAuth();

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await messagesService.createCategory(
      workspace.id,
      parsed.data.name,
    );
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
