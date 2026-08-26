import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { buildExecutiveSnapshot } from "@/lib/management/snapshot";
import { executiveSnapshotQuerySchema } from "@/lib/validation/management";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const parsed = executiveSnapshotQuerySchema.safeParse({
    period: request.nextUrl.searchParams.get("period") ?? undefined,
  });
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await buildExecutiveSnapshot(
      workspace.id,
      parsed.data.period,
    );
    return jsonResponse({
      ...result.snapshot,
      snapshotSha256: result.hash,
      byteLength: result.byteLength,
    });
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
