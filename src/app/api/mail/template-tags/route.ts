import { NextResponse, type NextRequest } from "next/server";
import { mailTemplateErrorResponse } from "@/lib/api/mail-template-errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { recordActivity } from "@/lib/services/activity";
import * as mailTemplates from "@/lib/services/mail-templates";
import { createMailTemplateTagSchema } from "@/lib/validation/mail";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    mailTemplateErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  try {
    return jsonResponse(
      await mailTemplates.listMailTemplateTags(auth.workspace.id),
    );
  } catch (error) {
    return mailTemplateErrorResponse(error, auth.workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    mailTemplateErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const parsed = createMailTemplateTagSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const tag = await mailTemplates.createMailTemplateTag(
      auth.workspace.id,
      auth.operator.id,
      parsed.data,
    );
    recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "create",
      entityType: "mail_template_tag",
      entityId: tag.id,
      entityLabel: tag.name,
    });
    return jsonResponse(tag, { status: 201 });
  } catch (error) {
    return mailTemplateErrorResponse(error, auth.workspace.id);
  }
}
