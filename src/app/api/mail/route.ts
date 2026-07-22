import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailService from "@/lib/services/mail";
import { env } from "@/lib/config/env";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { listMailQuerySchema } from "@/lib/validation/mail";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.has("labelId") && !env.MAIL_LABELS_ENABLED) {
    return jsonResponse({ error: "Resource not found." }, { status: 404 });
  }
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const parsed = listMailQuerySchema.safeParse(Object.fromEntries(sp));
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await mailService.list(workspace.id, {
      cursor: parsed.data.cursor,
      from: parsed.data.from,
      query: parsed.data.query,
      accountId: parsed.data.accountId,
      folderId: parsed.data.folderId,
      labelId: parsed.data.labelId,
      unreadOnly: parsed.data.unread === "1",
      sort: parsed.data.sort,
    });
    return jsonResponse({
      items: result.items.map(mailService.toMailListItemDto),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    if (error instanceof mailService.MailListResourceNotFoundError) {
      return jsonResponse({ error: error.code }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
