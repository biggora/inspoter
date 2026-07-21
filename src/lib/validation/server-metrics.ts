import { z } from "zod";
import * as ipaddr from "ipaddr.js";

// Server-metrics ingestion payload (agent → dashboard). This is an
// external, machine-to-machine API contract (a monitoring agent posting a
// JSON body), not a UI form, so error messages stay in English — mirrors
// the carve-out already applied to channelWebhookPayloadSchema in
// validation/webhookTokens.ts. IP classification uses ipaddr.js (not
// regex) so scope decisions (private/loopback/link-local/etc.) match the
// library's RFC-backed range tables exactly.

export type ServerAddressScope =
  | "GLOBAL"
  | "PRIVATE"
  | "LINK_LOCAL"
  | "LOOPBACK"
  | "RESERVED"
  | "OTHER";

export interface ClassifiedAddress {
  address: string;
  family: "IPV4" | "IPV6";
  scope: ServerAddressScope;
  matchKey: string | null;
}

export interface ParsedMetricsPayload {
  schemaVersion: 1;
  agentVersion: string;
  capturedAt: Date;
  hostname: string;
  addresses: ClassifiedAddress[];
  cpu: {
    usagePercent: number;
    load1: number;
    load5: number;
    load15: number;
  };
  memory: {
    totalBytes: number;
    availableBytes: number;
    swapTotalBytes: number;
    swapFreeBytes: number;
  };
  filesystem: {
    mount: string;
    totalBytes: number;
    availableBytes: number;
  };
  uptimeSeconds: number;
}

export class MetricsValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MetricsValidationError";
    this.code = code;
  }
}

export type MetricsValidationResult =
  | { success: true; data: ParsedMetricsPayload }
  | { success: false; error: MetricsValidationError };

// IPv4 ranges that can never legitimately identify a reachable server
// (RFC3171 multicast, RFC5735/919 broadcast, the unspecified 0.0.0.0/8
// block). Everything else is allowed through as metadata even when it
// can't be used to match a server (private/loopback/link-local/reserved).
const REJECTED_IPV4_RANGES = new Set(["broadcast", "unspecified", "multicast"]);

// IPv6 equivalents (RFC4291 unspecified ::, RFC4291 multicast ff00::/8).
const REJECTED_IPV6_RANGES = new Set(["unspecified", "multicast"]);

function classifyIPv4Range(range: string): ServerAddressScope {
  switch (range) {
    case "private":
      return "PRIVATE";
    case "loopback":
      return "LOOPBACK";
    case "linkLocal":
      return "LINK_LOCAL";
    case "reserved":
      return "RESERVED";
    case "unicast":
      return "GLOBAL";
    default:
      return "OTHER";
  }
}

function classifyIPv6Range(range: string): ServerAddressScope {
  switch (range) {
    case "loopback":
      return "LOOPBACK";
    case "linkLocal":
      return "LINK_LOCAL";
    case "uniqueLocal":
      return "PRIVATE";
    case "reserved":
      return "RESERVED";
    case "6to4":
    case "teredo":
      return "OTHER";
    default:
      return "GLOBAL";
  }
}

export function parseAndClassifyAddress(raw: string): ClassifiedAddress {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(raw);
  } catch {
    throw new MetricsValidationError(
      "INVALID_PAYLOAD",
      `Invalid IP address: ${raw}`,
    );
  }

  const range = parsed.range();
  const address = parsed.toString();

  if (parsed.kind() === "ipv4") {
    if (REJECTED_IPV4_RANGES.has(range)) {
      throw new MetricsValidationError(
        "INVALID_PAYLOAD",
        `Unsupported IPv4 address (${range}): ${raw}`,
      );
    }
    const scope = classifyIPv4Range(range);
    return {
      address,
      family: "IPV4",
      scope,
      matchKey: scope === "GLOBAL" ? address : null,
    };
  }

  if (REJECTED_IPV6_RANGES.has(range)) {
    throw new MetricsValidationError(
      "INVALID_PAYLOAD",
      `Unsupported IPv6 address (${range}): ${raw}`,
    );
  }
  return {
    address,
    family: "IPV6",
    scope: classifyIPv6Range(range),
    matchKey: null,
  };
}

const metricsPayloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  agentVersion: z.string().min(1).max(64),
  capturedAt: z.string().datetime(),
  hostname: z.string().min(1).max(255),
  ips: z.array(z.string()).min(1).max(16),
  cpu: z.strictObject({
    usagePercent: z.number().finite().min(0).max(100),
    load1: z.number().finite().min(0),
    load5: z.number().finite().min(0),
    load15: z.number().finite().min(0),
  }),
  memory: z.strictObject({
    totalBytes: z.number().int().finite().min(0),
    availableBytes: z.number().int().finite().min(0),
    swapTotalBytes: z.number().int().finite().min(0),
    swapFreeBytes: z.number().int().finite().min(0),
  }),
  filesystem: z.strictObject({
    mount: z.literal("/"),
    totalBytes: z.number().int().finite().min(0),
    availableBytes: z.number().int().finite().min(0),
  }),
  uptimeSeconds: z.number().int().finite().min(0),
});

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

function isUnsupportedSchemaVersion(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "schemaVersion" in body &&
    (body as { schemaVersion: unknown }).schemaVersion !== 1
  );
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");
}

export function validateMetricsPayload(body: unknown): MetricsValidationResult {
  if (isUnsupportedSchemaVersion(body)) {
    return {
      success: false,
      error: new MetricsValidationError(
        "UNSUPPORTED_SCHEMA_VERSION",
        "Unsupported metrics schemaVersion; expected 1.",
      ),
    };
  }

  const parsed = metricsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      error: new MetricsValidationError(
        "INVALID_PAYLOAD",
        formatZodError(parsed.error),
      ),
    };
  }

  const payload = parsed.data;

  if (payload.memory.availableBytes > payload.memory.totalBytes) {
    return {
      success: false,
      error: new MetricsValidationError(
        "INVALID_PAYLOAD",
        "memory.availableBytes cannot exceed memory.totalBytes.",
      ),
    };
  }
  if (payload.memory.swapFreeBytes > payload.memory.swapTotalBytes) {
    return {
      success: false,
      error: new MetricsValidationError(
        "INVALID_PAYLOAD",
        "memory.swapFreeBytes cannot exceed memory.swapTotalBytes.",
      ),
    };
  }
  if (payload.filesystem.availableBytes > payload.filesystem.totalBytes) {
    return {
      success: false,
      error: new MetricsValidationError(
        "INVALID_PAYLOAD",
        "filesystem.availableBytes cannot exceed filesystem.totalBytes.",
      ),
    };
  }

  const capturedAt = new Date(payload.capturedAt);
  if (capturedAt.getTime() > Date.now() + CLOCK_SKEW_TOLERANCE_MS) {
    return {
      success: false,
      error: new MetricsValidationError(
        "CLOCK_SKEW_FUTURE",
        "capturedAt is more than 5 minutes in the future.",
      ),
    };
  }

  const addresses: ClassifiedAddress[] = [];
  const seenAddresses = new Set<string>();
  for (const raw of payload.ips) {
    let classified: ClassifiedAddress;
    try {
      classified = parseAndClassifyAddress(raw);
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof MetricsValidationError
            ? err
            : new MetricsValidationError(
                "INVALID_PAYLOAD",
                `Invalid IP address: ${raw}`,
              ),
      };
    }
    if (seenAddresses.has(classified.address)) continue;
    seenAddresses.add(classified.address);
    addresses.push(classified);
  }

  return {
    success: true,
    data: {
      schemaVersion: 1,
      agentVersion: payload.agentVersion,
      capturedAt,
      hostname: payload.hostname,
      addresses,
      cpu: payload.cpu,
      memory: payload.memory,
      filesystem: payload.filesystem,
      uptimeSeconds: payload.uptimeSeconds,
    },
  };
}
