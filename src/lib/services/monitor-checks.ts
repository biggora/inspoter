import net from "node:net";
import { MonitorType, type Service } from "@/generated/prisma/client";

// Pure check functions for Services monitoring (plan.md "Логика проверок").
// Node built-ins only — no new npm dependency.

export interface CheckOutcome {
  ok: boolean;
  responseTimeMs: number;
  message?: string;
}

const DEFAULT_EXPECTED_STATUS_CODES = "200-299";
const DEFAULT_PING_PORT = 80;

function parseStatusCodeSpec(spec: string): Array<[number, number]> {
  return spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [start, end] = part.split("-");
      const lo = Number(start);
      const hi = end !== undefined ? Number(end) : lo;
      return [lo, hi] as [number, number];
    });
}

function statusMatchesSpec(status: number, spec: string): boolean {
  return parseStatusCodeSpec(spec).some(([lo, hi]) => status >= lo && status <= hi);
}

export async function checkHttp(params: {
  url: string;
  timeoutMs: number;
  expectedStatusCodes?: string | null;
}): Promise<CheckOutcome> {
  const spec = params.expectedStatusCodes?.trim() || DEFAULT_EXPECTED_STATUS_CODES;
  const start = performance.now();
  try {
    const response = await fetch(params.url, {
      signal: AbortSignal.timeout(params.timeoutMs),
      redirect: "follow",
    });
    const responseTimeMs = Math.round(performance.now() - start);
    if (statusMatchesSpec(response.status, spec)) {
      return { ok: true, responseTimeMs };
    }
    return {
      ok: false,
      responseTimeMs,
      message: `Unexpected status code ${response.status} (expected ${spec})`,
    };
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start);
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `Timed out after ${params.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Unknown network error";
    return { ok: false, responseTimeMs, message };
  }
}

export function checkTcp(params: {
  host: string;
  port: number;
  timeoutMs: number;
}): Promise<CheckOutcome> {
  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;
    const socket = net.createConnection({
      host: params.host,
      port: params.port,
      timeout: params.timeoutMs,
    });

    const finish = (outcome: CheckOutcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    socket.once("connect", () => {
      finish({ ok: true, responseTimeMs: Math.round(performance.now() - start) });
    });
    socket.once("timeout", () => {
      finish({
        ok: false,
        responseTimeMs: Math.round(performance.now() - start),
        message: `Connection to ${params.host}:${params.port} timed out after ${params.timeoutMs}ms`,
      });
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        responseTimeMs: Math.round(performance.now() - start),
        message: error.message,
      });
    });
  });
}

// Reachability probe, NOT a true ICMP echo: the app runs in a container
// without CAP_NET_RAW, so Node cannot send raw ICMP packets without root
// (plan.md "Логика проверок" — documented tradeoff). We approximate
// reachability with a TCP connect attempt instead: a successful connect
// obviously proves the host is up; ECONNREFUSED also proves the host is up
// (its OS actively replied with a TCP RST — there's just nothing listening
// on `port`). ETIMEDOUT/ENETUNREACH/EHOSTUNREACH/ENOTFOUND mean nobody
// answered at all, so we treat those as down.
export function checkPing(params: {
  host: string;
  port?: number;
  timeoutMs: number;
}): Promise<CheckOutcome> {
  const port = params.port ?? DEFAULT_PING_PORT;
  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;
    const socket = net.createConnection({ host: params.host, port, timeout: params.timeoutMs });

    const finish = (outcome: CheckOutcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    socket.once("connect", () => {
      finish({ ok: true, responseTimeMs: Math.round(performance.now() - start) });
    });
    socket.once("timeout", () => {
      finish({
        ok: false,
        responseTimeMs: Math.round(performance.now() - start),
        message: `Host ${params.host} did not respond within ${params.timeoutMs}ms`,
      });
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      const responseTimeMs = Math.round(performance.now() - start);
      if (error.code === "ECONNREFUSED") {
        // Host answered (refused the connection) — reachable.
        finish({ ok: true, responseTimeMs });
        return;
      }
      finish({ ok: false, responseTimeMs, message: error.message });
    });
  });
}

export async function runCheck(
  service: Pick<
    Service,
    "monitorType" | "url" | "host" | "port" | "timeoutMs" | "expectedStatusCodes"
  >,
): Promise<CheckOutcome> {
  switch (service.monitorType) {
    case MonitorType.HTTP:
      if (!service.url) {
        return { ok: false, responseTimeMs: 0, message: "Service is missing a URL" };
      }
      return checkHttp({
        url: service.url,
        timeoutMs: service.timeoutMs,
        expectedStatusCodes: service.expectedStatusCodes,
      });
    case MonitorType.TCP:
      if (!service.host || !service.port) {
        return { ok: false, responseTimeMs: 0, message: "Service is missing host/port" };
      }
      return checkTcp({ host: service.host, port: service.port, timeoutMs: service.timeoutMs });
    case MonitorType.PING:
      if (!service.host) {
        return { ok: false, responseTimeMs: 0, message: "Service is missing a host" };
      }
      return checkPing({
        host: service.host,
        port: service.port ?? undefined,
        timeoutMs: service.timeoutMs,
      });
    default:
      return {
        ok: false,
        responseTimeMs: 0,
        message: `Unsupported monitor type: ${service.monitorType as string}`,
      };
  }
}
