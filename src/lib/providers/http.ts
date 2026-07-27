// Thin HTTP client shared by real provider implementations (architecture.md
// §4.1) — retries transient failures with backoff and normalizes every
// failure into a ProviderResult so providers never throw to callers.

import type { ProviderResult } from "@/lib/providers/result";
import { Agent } from "undici";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000, 4000];

export interface ProviderHttpClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  allowInsecure?: boolean;
}

export interface ProviderHttpRequestOptions {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ProviderHttpClient {
  request<T>(options: ProviderHttpRequestOptions): Promise<ProviderResult<T>>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

const SNIPPET_MAX = 200;

// Collapses whitespace and truncates text destined for a user-facing error
// message, so a large HTML error page or JSON blob can't flood a LogEntry
// row on the Logs page.
function truncateSnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_MAX
    ? `${collapsed.slice(0, SNIPPET_MAX)}…`
    : collapsed;
}

// Reads a response body for inclusion in an error message. Must never throw
// itself — a broken body stream shouldn't take down error handling with it.
async function safeBodySnippet(response: Response): Promise<string> {
  try {
    return truncateSnippet(await response.text());
  } catch {
    return "(unable to read response body)";
  }
}

// Extracts the useful part of a fetch() rejection for the Logs page. undici
// commonly wraps the real reason in `error.cause` — the top-level message is
// often just the unhelpful "fetch failed" — so prefer that when present.
function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return cause.message;
    if (typeof cause === "string" && cause) return cause;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(err);
}

export function createProviderHttpClient(
  options: ProviderHttpClientOptions = {},
): ProviderHttpClient {
  const { baseUrl = "", headers: baseHeaders = {}, timeout = 10_000 } = options;

  // Narrow, opt-in security trade-off for self-signed cPanel servers — never
  // default this to true, and never let it leak to other providers.
  const insecureDispatcher = options.allowInsecure
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

  async function request<T>(
    reqOptions: ProviderHttpRequestOptions,
  ): Promise<ProviderResult<T>> {
    const url = `${baseUrl}${reqOptions.path}`;
    const headers = { ...baseHeaders, ...reqOptions.headers };

    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let response: Response;
      const timeoutSignal = AbortSignal.timeout(timeout);
      try {
        response = await fetch(url, {
          method: reqOptions.method ?? "GET",
          headers,
          body:
            reqOptions.body !== undefined
              ? JSON.stringify(reqOptions.body)
              : undefined,
          signal: reqOptions.signal
            ? AbortSignal.any([reqOptions.signal, timeoutSignal])
            : timeoutSignal,
          ...(insecureDispatcher ? { dispatcher: insecureDispatcher } : {}),
        });
      } catch (err) {
        if (reqOptions.signal?.aborted) {
          return {
            ok: false,
            kind: "error",
            message: "Request aborted",
          };
        }
        // Preserve the real cause for the user-facing Logs page — headers
        // and the request body are deliberately excluded, since they carry
        // Authorization/API-key material that must never reach a log entry.
        return {
          ok: false,
          kind: "error",
          message: `Provider unreachable: ${describeError(err)}`,
        };
      }

      if (response.status === 401 || response.status === 403) {
        // 401 vs 403 mean different things when debugging credentials.
        return {
          ok: false,
          kind: "error",
          message: `Authentication failed (HTTP ${response.status})`,
        };
      }

      if (isRetryableStatus(response.status)) {
        lastStatus = response.status;
        if (attempt < MAX_ATTEMPTS - 1) {
          await delay(BACKOFF_MS[attempt]);
          continue;
        }
        break;
      }

      if (!response.ok) {
        // Providers usually return machine-readable JSON here — surface
        // status + a truncated body snippet, but never the request headers
        // or body (they carry the provider's credentials/secrets).
        return {
          ok: false,
          kind: "error",
          message: `Provider error (HTTP ${response.status}): ${await safeBodySnippet(response)}`,
        };
      }

      const text = await response.text();
      if (!text) return { ok: true, data: undefined as T };
      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        return {
          ok: false,
          kind: "error",
          message: `Invalid response from provider: ${truncateSnippet(text)}`,
        };
      }
      return { ok: true, data };
    }

    // Retries are exhausted — include the status so the Logs page shows
    // what finally failed instead of a bare, undifferentiated label.
    return {
      ok: false,
      kind: "error",
      message:
        lastStatus === 429
          ? `Rate limited (HTTP 429, ${MAX_ATTEMPTS} attempts)`
          : `Provider error (HTTP ${lastStatus}, ${MAX_ATTEMPTS} attempts)`,
    };
  }

  return { request };
}
