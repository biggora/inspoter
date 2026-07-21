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
      } catch {
        if (reqOptions.signal?.aborted) {
          return {
            ok: false,
            kind: "error",
            message: "Request aborted",
          };
        }
        return {
          ok: false,
          kind: "error",
          message: "Provider unreachable",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          kind: "error",
          message: "Authentication failed",
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
        return {
          ok: false,
          kind: "error",
          message: "Provider error",
        };
      }

      const text = await response.text();
      if (!text) return { ok: true, data: undefined as T };
      const data = JSON.parse(text) as T;
      return { ok: true, data };
    }

    return {
      ok: false,
      kind: "error",
      message: lastStatus === 429 ? "Rate limited" : "Provider error",
    };
  }

  return { request };
}
