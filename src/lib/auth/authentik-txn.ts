// Short-lived, single-use transaction cookie shared between the Authentik
// login-initiation and callback routes — carries the PKCE code_verifier,
// `state`, `nonce`, and the sanitized post-login `next` path across the
// redirect to Authentik and back.

export const AUTHENTIK_TXN_COOKIE_NAME = "authentik_txn";
const TXN_MAX_AGE_SECONDS = 600; // 10 minutes

export interface AuthentikTxn {
  state: string;
  nonce: string;
  codeVerifier: string;
  next: string;
}

export const AUTHENTIK_TXN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/api/auth/authentik",
  maxAge: TXN_MAX_AGE_SECONDS,
};

export function encodeAuthentikTxn(txn: AuthentikTxn): string {
  return Buffer.from(JSON.stringify(txn), "utf8").toString("base64url");
}

export function decodeAuthentikTxn(
  value: string | undefined,
): AuthentikTxn | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as AuthentikTxn).state !== "string" ||
      typeof (parsed as AuthentikTxn).nonce !== "string" ||
      typeof (parsed as AuthentikTxn).codeVerifier !== "string" ||
      typeof (parsed as AuthentikTxn).next !== "string"
    ) {
      return null;
    }
    return parsed as AuthentikTxn;
  } catch {
    return null;
  }
}
