import { NextResponse, type NextRequest } from "next/server";
import { mailTemplateErrorResponse } from "@/lib/api/mail-template-errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { recordActivity } from "@/lib/services/activity";
import * as mailTemplates from "@/lib/services/mail-templates";
import { updateMailTemplateTagSchema } from "@/lib/validation/mail";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    mailTemplateErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return jsonResponse(
      await mailTemplates.getMailTemplateTag(auth.workspace.id, id),
    );
  } catch (error) {
    return mailTemplateErrorResponse(error, auth.workspace.id);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    mailTemplateErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = updateMailTemplateTagSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const tag = await mailTemplates.updateMailTemplateTag(
      auth.workspace.id,
      auth.operator.id,
      id,
      parsed.data,
    );
    recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "update",
      entityType: "mail_template_tag",
      entityId: id,
      entityLabel: tag.name,
    });
    return jsonResponse(tag);
  } catch (error) {
    return mailTemplateErrorResponse(error, auth.workspace.id);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    mailTemplateErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const tag = await mailTemplates.getMailTemplateTag(auth.workspace.id, id);
    await mailTemplates.deleteMailTemplateTag(
      auth.workspace.id,
      auth.operator.id,
      id,
    );
    recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "delete",
      entityType: "mail_template_tag",
      entityId: id,
      entityLabel: tag.name,
    });
    return emptyResponse();
  } catch (error) {
    return mailTemplateErrorResponse(error, auth.workspace.id);
  }
}
