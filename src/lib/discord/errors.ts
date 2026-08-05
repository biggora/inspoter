import { NextResponse } from "next/server";
import type { z } from "zod";

type DiscordZodIssue = z.core.$ZodIssue;

// Discord-shaped error bodies (specs/discord-webhook-compatibility.md §4).
// Verbatim Discord wording on purpose: these responses go to an external
// sender hitting the public Discord-compatible route, never to the dashboard —
// the same carve-out src/lib/validation/webhooks.ts already documents.

export const DISCORD_ERROR = {
  GENERAL: 0,
  UNKNOWN_WEBHOOK: 10015,
  REQUEST_ENTITY_TOO_LARGE: 40005,
  CANNOT_SEND_EMPTY_MESSAGE: 50006,
  INVALID_FORM_BODY: 50035,
} as const;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

interface FieldError {
  code: string;
  message: string;
}

// Discord's error tree: every leaf is `{ _errors: [{ code, message }] }`, keyed
// by the path segment (array indexes become numeric string keys).
interface ErrorNode {
  _errors?: FieldError[];
  [key: string]: ErrorNode | FieldError[] | undefined;
}

export function discordResponse(
  body: unknown,
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

export function discordEmptyResponse(
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return new NextResponse(null, {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

export function discordError(
  status: number,
  code: number,
  message: string,
  errors?: ErrorNode,
  headers?: HeadersInit,
): NextResponse {
  return discordResponse(
    { message, code, ...(errors ? { errors } : {}) },
    status,
    headers,
  );
}

// Maps a Zod issue onto the closest Discord form-error code. Discord's codes are
// coarse, so several Zod kinds collapse onto one.
function issueCode(issue: DiscordZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined
        ? "BASE_TYPE_REQUIRED"
        : "BASE_TYPE_INVALID";
    case "too_big":
      return issue.origin === "string" || issue.origin === "array"
        ? "BASE_TYPE_MAX_LENGTH"
        : "NUMBER_TYPE_MAX";
    case "too_small":
      return issue.origin === "string" || issue.origin === "array"
        ? "BASE_TYPE_MIN_LENGTH"
        : "NUMBER_TYPE_MIN";
    case "invalid_value":
      return "BASE_TYPE_CHOICES";
    case "invalid_format":
      return "BASE_TYPE_INVALID";
    default:
      return "BASE_TYPE_INVALID";
  }
}

export function zodIssuesToDiscordErrors(
  issues: readonly DiscordZodIssue[],
): ErrorNode {
  const root: ErrorNode = {};

  for (const issue of issues) {
    let node = root;
    for (const segment of issue.path) {
      const key = String(segment);
      const next = node[key];
      if (next && !Array.isArray(next)) {
        node = next;
      } else {
        const created: ErrorNode = {};
        node[key] = created;
        node = created;
      }
    }
    const leaf = node._errors ?? [];
    leaf.push({ code: issueCode(issue), message: issue.message });
    node._errors = leaf;
  }

  return root;
}

export function invalidFormBody(
  issues: readonly DiscordZodIssue[],
  headers?: HeadersInit,
): NextResponse {
  return discordError(
    400,
    DISCORD_ERROR.INVALID_FORM_BODY,
    "Invalid Form Body",
    zodIssuesToDiscordErrors(issues),
    headers,
  );
}

export function unauthorized(headers?: HeadersInit): NextResponse {
  return discordError(
    401,
    DISCORD_ERROR.GENERAL,
    "401: Unauthorized",
    undefined,
    headers,
  );
}
