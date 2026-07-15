import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  AUTHENTIK_TXN_COOKIE_NAME,
  encodeAuthentikTxn,
} from "@/lib/auth/authentik-txn";

// Callback route control-flow: state/nonce/PKCE validation is delegated to
// openid-client (mocked at that boundary — re-verifying an already-audited
// signature/claims library adds no value here), find-or-create/session
// wiring is asserted against mocks, and Prisma-backed behavior is covered
// separately in tests/unit/services/external-identity.test.ts.

const {
  authorizationCodeGrantMock,
  getAuthentikConfigMock,
  findOrCreateOperatorMock,
  createSessionMock,
  establishInitialWorkspaceMock,
} = vi.hoisted(() => ({
  authorizationCodeGrantMock: vi.fn(),
  getAuthentikConfigMock: vi.fn(),
  findOrCreateOperatorMock: vi.fn(),
  createSessionMock: vi.fn(),
  establishInitialWorkspaceMock: vi.fn(),
}));

vi.mock("openid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openid-client")>();
  return { ...actual, authorizationCodeGrant: authorizationCodeGrantMock };
});

vi.mock("@/lib/auth/authentik-client", () => ({
  getAuthentikConfig: getAuthentikConfigMock,
}));

vi.mock("@/lib/services/external-identity", () => ({
  findOrCreateOperatorForExternalIdentity: findOrCreateOperatorMock,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: createSessionMock,
  establishInitialWorkspace: establishInitialWorkspaceMock,
}));

const ORIGINAL_ENV = { ...process.env };

async function loadRouteWithAuthentikEnabled() {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    AUTHENTIK_ISSUER: "https://auth.example.com/application/o/inspoter/",
    AUTHENTIK_CLIENT_ID: "client-id",
    AUTHENTIK_CLIENT_SECRET: "client-secret",
    AUTHENTIK_REDIRECT_URI:
      "https://dashboard.example.com/api/auth/authentik/callback",
  };
  return import("@/app/api/auth/authentik/callback/route");
}

function makeRequest(txnCookie?: string): NextRequest {
  const request = new NextRequest(
    "http://localhost/api/auth/authentik/callback?code=abc&state=xyz",
  );
  if (txnCookie) {
    request.cookies.set(AUTHENTIK_TXN_COOKIE_NAME, txnCookie);
  }
  return request;
}

function validTxn(overrides: Partial<Parameters<typeof encodeAuthentikTxn>[0]> = {}) {
  return encodeAuthentikTxn({
    state: "xyz",
    nonce: "nonce",
    codeVerifier: "verifier",
    next: "/bookmarks",
    ...overrides,
  });
}

beforeEach(() => {
  authorizationCodeGrantMock.mockReset();
  getAuthentikConfigMock.mockReset().mockResolvedValue({});
  findOrCreateOperatorMock.mockReset();
  createSessionMock.mockReset();
  establishInitialWorkspaceMock.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("GET /api/auth/authentik/callback", () => {
  it("redirects to /login?error=authentik_state when the transaction cookie is missing", async () => {
    const { GET } = await loadRouteWithAuthentikEnabled();
    const res = await GET(makeRequest());

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("authentik_state");
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=authentik_failed when the token exchange throws", async () => {
    authorizationCodeGrantMock.mockRejectedValueOnce(new Error("bad state"));

    const { GET } = await loadRouteWithAuthentikEnabled();
    const res = await GET(makeRequest(validTxn()));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("authentik_failed");
  });

  it("redirects to /login?error=authentik_failed when the ID token has no `sub` claim", async () => {
    authorizationCodeGrantMock.mockResolvedValueOnce({
      claims: () => ({ email: "user@example.com" }),
    });

    const { GET } = await loadRouteWithAuthentikEnabled();
    const res = await GET(makeRequest(validTxn()));

    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("authentik_failed");
    expect(findOrCreateOperatorMock).not.toHaveBeenCalled();
  });

  it("creates a session and redirects to `next` when the operator has a workspace", async () => {
    authorizationCodeGrantMock.mockResolvedValueOnce({
      claims: () => ({ sub: "sub-1", email: "user@example.com" }),
    });
    findOrCreateOperatorMock.mockResolvedValueOnce({ id: "operator-1" });
    createSessionMock.mockResolvedValueOnce({ id: "session-1" });
    establishInitialWorkspaceMock.mockResolvedValueOnce(true);

    const { GET } = await loadRouteWithAuthentikEnabled();
    const res = await GET(makeRequest(validTxn({ next: "/mail" })));

    expect(findOrCreateOperatorMock).toHaveBeenCalledWith({
      subject: "sub-1",
      email: "user@example.com",
      preferredUsername: undefined,
    });
    expect(createSessionMock).toHaveBeenCalledWith("operator-1");
    expect(establishInitialWorkspaceMock).toHaveBeenCalledWith(
      "session-1",
      "operator-1",
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/mail");
  });

  it("redirects to /no-workspace when the operator has zero workspace memberships", async () => {
    authorizationCodeGrantMock.mockResolvedValueOnce({
      claims: () => ({ sub: "sub-2" }),
    });
    findOrCreateOperatorMock.mockResolvedValueOnce({ id: "operator-2" });
    createSessionMock.mockResolvedValueOnce({ id: "session-2" });
    establishInitialWorkspaceMock.mockResolvedValueOnce(false);

    const { GET } = await loadRouteWithAuthentikEnabled();
    const res = await GET(makeRequest(validTxn()));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/no-workspace");
  });

  it("clears the transaction cookie regardless of outcome", async () => {
    authorizationCodeGrantMock.mockRejectedValueOnce(new Error("boom"));

    const { GET } = await loadRouteWithAuthentikEnabled();
    const res = await GET(makeRequest(validTxn()));

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("authentik_txn=");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });
});
