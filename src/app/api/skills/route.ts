import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { skillCreateSchema } from "@/lib/validation/agents";
import * as skillsService from "@/lib/services/skills";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

// Skills live at /api/skills rather than under /api/agents so a skill id and
// the literal segment "skills" can never shadow each other in the router.

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  try {
    return jsonResponse(await skillsService.listSkills(workspace.id));
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = skillCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const skill = await skillsService.createSkill(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "skill",
      entityId: skill.id,
      entityLabel: skill.name,
    });
    return jsonResponse(skill, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
