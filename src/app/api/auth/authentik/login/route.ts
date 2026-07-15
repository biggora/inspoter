import { NextResponse, type NextRequest } from "next/server";
import * as client from "openid-client";
import { authentikEnabled, env } from "@/lib/config/env";
import { getAuthentikConfig } from "@/lib/auth/authentik-client";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import {
  AUTHENTIK_TXN_COOKIE_NAME,
  AUTHENTIK_TXN_COOKIE_OPTIONS,
  encodeAuthentikTxn,
} from "@/lib/auth/authentik-txn";

// Login-initiation endpoint — builds a PKCE authorization request and
// redirects to Authentik. Excluded from src/proxy.ts's matcher: it must be
// reachable with no session cookie present.

export async function GET(request: NextRequest) {
  if (!authentikEnabled) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  let authorizationUrl: URL;
  let state: string;
  let nonce: string;
  let codeVerifier: string;
  try {
    const config = await getAuthentikConfig();
    codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    state = client.randomState();
    nonce = client.randomNonce();

    authorizationUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: env.AUTHENTIK_REDIRECT_URI!,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });
  } catch (error) {
    // E.g. Authentik is unreachable or misconfigured (discovery failure) —
    // fail into the normal login-error UI instead of an unhandled 500.
    console.error("Authentik login-initiation failed:", error);
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "authentik_failed");
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(
    AUTHENTIK_TXN_COOKIE_NAME,
    encodeAuthentikTxn({ state, nonce, codeVerifier, next }),
    AUTHENTIK_TXN_COOKIE_OPTIONS,
  );
  return response;
}
