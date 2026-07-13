import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";
import { toErrorResponse } from "@/lib/api/errors";

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = nameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const category = await alertsService.renameCategory(
      id,
      workspace.id,
      parsed.data.name,
    );
    return NextResponse.json(category);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  try {
    await alertsService.deleteCategory(id, workspace.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
