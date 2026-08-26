import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { jsonResponse } from "@/lib/api/response";
import { toErrorResponse } from "@/lib/api/errors";
import { calendarRangeSchema } from "@/lib/validation/calendar";
import { listRange } from "@/lib/services/calendar";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const parsed = calendarRangeSchema.safeParse({
    from: request.nextUrl.searchParams.get("from"),
    to: request.nextUrl.searchParams.get("to"),
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    return jsonResponse(
      await listRange(
        workspace.id,
        new Date(parsed.data.from),
        new Date(parsed.data.to),
      ),
    );
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
