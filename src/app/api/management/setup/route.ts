import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  ensureExecutiveBriefSetup,
  getExecutiveBriefSetupStatus,
} from "@/lib/services/executive-briefs";

async function auth(request: NextRequest) {
  return requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
}

export async function GET(request: NextRequest) {
  const result = await auth(request);
  if (result instanceof NextResponse) return result;
  try {
    return jsonResponse(
      await getExecutiveBriefSetupStatus(result.workspace.id),
    );
  } catch (error) {
    return toErrorResponse(error, result.workspace.id);
  }
}

export async function POST(request: NextRequest) {
  const result = await auth(request);
  if (result instanceof NextResponse) return result;
  try {
    return jsonResponse(await ensureExecutiveBriefSetup(result.workspace.id));
  } catch (error) {
    return toErrorResponse(error, result.workspace.id);
  }
}
