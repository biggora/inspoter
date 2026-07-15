import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as servicesService from "@/lib/services/services";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;

  const pageSizeParam = searchParams.get("pageSize");
  const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

  try {
    const result = await servicesService.listChecks(id, workspace.id, {
      cursor: searchParams.get("cursor") ?? undefined,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
    });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof servicesService.ServiceNotFoundError) {
      return jsonResponse({ error: "Resource not found." }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
