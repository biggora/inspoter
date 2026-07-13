import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { addMemberSchema } from "@/lib/validation/workspaces";
import * as workspacesService from "@/lib/services/workspaces";
import { toErrorResponse } from "@/lib/api/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  await requireAuth();
  const { id } = await params;

  const members = await workspacesService.listMembers(id);
  return NextResponse.json(members);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  await requireAuth();
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const member = await workspacesService.addMember(id, parsed.data);
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
