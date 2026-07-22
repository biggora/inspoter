import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { authentikEnabled, env } from "@/lib/config/env";
import { getAuthentikConfig } from "@/lib/auth/authentik-client";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import {
  AUTHENTIK_TXN_COOKIE_NAME,
  AUTHENTIK_TXN_COOKIE_OPTIONS,
  decodeAuthentikTxn,
} from "@/lib/auth/authentik-txn";
import { findOrCreateOperatorForExternalIdentity } from "@/lib/services/external-identity";
import { ensureDefaultWorkspace } from "@/lib/services/workspaces";
import { createSession, establishInitialWorkspace } from "@/lib/auth/session";

// Callback endpoint — validates the authorization response (state/nonce/PKCE/
// ID-token signature, all via openid-client), finds-or-auto-creates the
// linked Operator, and establishes a session. Excluded from src/proxy.ts's
// matcher: it must be reachable with no session cookie present.

function loginErrorRedirect(request: NextRequest, code: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

function clearTxnCookie(response: NextResponse) {
  response.cookies.set(AUTHENTIK_TXN_COOKIE_NAME, "", {
    ...AUTHENTIK_TXN_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  if (!authentikEnabled) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Single-use: read and clear the transaction cookie regardless of outcome.
  const txn = decodeAuthentikTxn(
    request.cookies.get(AUTHENTIK_TXN_COOKIE_NAME)?.value,
  );
  if (!txn) {
    return clearTxnCookie(loginErrorRedirect(request, "authentik_state"));
  }

  // Everything below (token exchange through session creation) is one
  // failure domain: any error — bad state/nonce/PKCE, a transient DB error,
  // exhausted username-collision retries — must still clear the single-use
  // transaction cookie and fail into the login-error UI, never an unhandled
  // 500.
  try {
    const config = await getAuthentikConfig();
    // Behind a reverse proxy request.url reflects the internal container
    // address (e.g. http://localhost:3000/…). openid-client derives
    // redirect_uri from the URL passed here, so use the configured
    // external URI to match what was sent in the authorization request.
    const callbackUrl = new URL(env.AUTHENTIK_REDIRECT_URI!);
    callbackUrl.search = new URL(request.url).search;
    const tokens = await client.authorizationCodeGrant(
      config,
      callbackUrl,
      {
        pkceCodeVerifier: txn.codeVerifier,
        expectedState: txn.state,
        expectedNonce: txn.nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();

    if (!claims?.sub) {
      throw new Error("Authentik callback: no `sub` claim in the ID token");
    }

    const { operator } = await findOrCreateOperatorForExternalIdentity({
      subject: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      preferredUsername:
        typeof claims.preferred_username === "string"
          ? claims.preferred_username
          : undefined,
    });

    const session = await createSession(operator.id);
    let hasWorkspace = await establishInitialWorkspace(session.id, operator.id);

    if (!hasWorkspace) {
      await ensureDefaultWorkspace(
        operator.id,
        `${operator.username}'s workspace`,
      );
      hasWorkspace = await establishInitialWorkspace(session.id, operator.id);
    }

    const destination = hasWorkspace
      ? sanitizeNextPath(txn.next)
      : "/no-workspace";
    return clearTxnCookie(
      NextResponse.redirect(new URL(destination, request.url)),
    );
  } catch (error) {
    console.error("Authentik login failed:", error);
    return clearTxnCookie(loginErrorRedirect(request, "authentik_failed"));
  }
}
