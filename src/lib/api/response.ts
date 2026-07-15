import { NextResponse } from "next/server";

const WORKSPACE_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "x-inspoter-workspace",
} as const;

export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(WORKSPACE_CACHE_HEADERS)) {
    headers.set(key, value);
  }
  return NextResponse.json(data, { ...init, headers });
}

export function emptyResponse(status = 204): NextResponse {
  return new NextResponse(null, {
    status,
    headers: WORKSPACE_CACHE_HEADERS,
  });
}
