import { NextResponse, type NextRequest } from "next/server";
import { mailTemplateErrorResponse } from "@/lib/api/mail-template-errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { recordActivity } from "@/lib/services/activity";
import * as mailTemplates from "@/lib/services/mail-templates";
import {
  createMailTemplateSchema,
  listMailTemplatesQuerySchema,
} from "@/lib/validation/mail";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    mailTemplateErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const parsed = listMailTemplatesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(
      await mailTemplates.listMailTemplates(auth.workspace.id, parsed.data),
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
  const parsed = createMailTemplateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const template = await mailTemplates.createMailTemplate(
      auth.workspace.id,
      auth.operator.id,
      parsed.data,
    );
    recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "create",
      entityType: "mail_template",
      entityId: template.id,
      entityLabel: template.name,
    });
    return jsonResponse(template, { status: 201 });
  } catch (error) {
    return mailTemplateErrorResponse(error, auth.workspace.id);
  }
}
