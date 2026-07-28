import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

// The optimistic auth proxy redirects cookie-less requests to /login. Public
// endpoints authenticate with a bearer API token and never carry a session
// cookie, so an unexempt path would answer an MCP client or a monitoring agent
// with a 307 to the login page instead of reaching its handler.

function request(pathname: string, withSession = false): NextRequest {
  const headers = new Headers();
  if (withSession) headers.set("cookie", "session=abc123");
  return new NextRequest(`http://localhost:3800${pathname}`, {
    method: "POST",
    headers,
  });
}

describe("proxy auth exemptions", () => {
  it.each([
    "/api/mcp",
    "/api/server-metrics",
    "/api/webhooks/log",
    "/api/webhooks/channels/abc/secret",
    "/api/auth/authentik/login",
  ])("passes %s through without a session cookie", (pathname) => {
    expect(proxy(request(pathname)).status).not.toBe(307);
  });

  it("still redirects a cookie-less request to a session-scoped API route", () => {
    const response = proxy(request("/api/webhook-tokens"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("lets a request with a session cookie through", () => {
    expect(proxy(request("/api/webhook-tokens", true)).status).not.toBe(307);
  });
});
