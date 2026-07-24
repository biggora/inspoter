import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getWebhookSchema, SUPPORTED_TYPES } from "@/lib/validation/webhooks";
import {
  channelWebhookPayloadSchema,
  idempotencyKeySchema,
} from "@/lib/validation/webhookTokens";
import { validateMetricsPayload } from "@/lib/validation/server-metrics";

interface SchemaObject {
  $ref?: string;
  type?: string;
  enum?: string[];
  oneOf?: SchemaObject[];
  discriminator?: unknown;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, SchemaObject>;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  "x-sensitive"?: boolean;
  example?: unknown;
  default?: unknown;
}

interface ParameterObject {
  $ref?: string;
  name?: string;
  in?: string;
  required?: boolean;
  schema?: SchemaObject;
}

interface MediaTypeObject {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
}

interface ResponseObject {
  description?: string;
  headers?: Record<string, unknown>;
  content?: Record<string, MediaTypeObject>;
}

interface OperationObject {
  security?: Array<Record<string, string[]>>;
  parameters?: ParameterObject[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, MediaTypeObject>;
  };
  responses?: Record<string, ResponseObject>;
}

interface OpenApiSpec {
  paths: Record<string, Record<string, OperationObject>>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
    securitySchemes?: Record<string, { type?: string; scheme?: string }>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const specPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../specs/openapi.json",
);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as OpenApiSpec;
const typedPath = "/api/webhooks/{type}";
const channelPath = "/api/webhooks/channels/{webhookId}/{token}";
const typed = spec.paths[typedPath].post;
const channel = spec.paths[channelPath].post;
const responseStatuses = ["200", "201", "400", "401", "413", "429", "500"];
const metricsPath = "/api/server-metrics";
const metrics = spec.paths[metricsPath].post;
const metricsResponseStatuses = [
  "200", "201", "400", "401", "409", "413", "422", "429", "500", "503",
];

function resolveRef<T>(value: T & { $ref?: string }): T {
  if (!value.$ref?.startsWith("#/")) return value;
  let resolved: unknown = spec;
  for (const part of value.$ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (!isRecord(resolved)) throw new Error(`Cannot resolve ${value.$ref}`);
    resolved = resolved[part];
  }
  if (!isRecord(resolved)) throw new Error(`Cannot resolve ${value.$ref}`);
  return resolved as T;
}

function parameter(operation: OperationObject, name: string, location: string) {
  const match = operation.parameters
    ?.map((candidate) => resolveRef(candidate))
    .find((candidate) => candidate.name === name && candidate.in === location);
  if (!match) throw new Error(`Missing ${location} parameter ${name}`);
  return match;
}

function responseSchema(operation: OperationObject, status: string) {
  const schema =
    operation.responses?.[status]?.content?.["application/json"]?.schema;
  return schema ? resolveRef(schema) : undefined;
}

function collectStringValues(value: unknown, values: string[] = []) {
  if (typeof value === "string") values.push(value);
  else if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, values));
  } else if (isRecord(value)) {
    Object.values(value).forEach((item) => collectStringValues(item, values));
  }
  return values;
}

function forbiddenExampleEntries(
  value: unknown,
  insideExample = false,
  location = "spec",
  hits: string[] = [],
) {
  if (!isRecord(value) && !Array.isArray(value)) return hits;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    const childInsideExample =
      insideExample || /^(?:example|examples|default)$/i.test(key);
    if (
      insideExample &&
      /(?:token|authorization|api[-_]?key|api[-_]?secret|password|secret|bearer)/i.test(
        key,
      )
    ) {
      hits.push(childLocation);
    }
    if (
      childInsideExample &&
      typeof child === "string" &&
      /(?:\bsk-[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}|\bAKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{8,})/.test(
        child,
      )
    ) {
      hits.push(childLocation);
    }
    forbiddenExampleEntries(child, childInsideExample, childLocation, hits);
  }
  return hits;
}

describe("public OpenAPI contract", () => {
  it("contains exactly the expected public POST paths", () => {
    expect(Object.keys(spec.paths).sort()).toEqual(
      [metricsPath, channelPath, typedPath].sort(),
    );
    for (const pathItem of Object.values(spec.paths)) {
      expect(Object.keys(pathItem)).toEqual(["post"]);
    }
  });

  it("keeps typed payloads aligned with runtime validation", () => {
    const type = parameter(typed, "type", "path");
    expect(type.required).toBe(true);
    expect(type.schema?.enum).toEqual(SUPPORTED_TYPES);

    const media = typed.requestBody?.content?.["application/json"];
    expect(typed.requestBody?.required).toBe(true);
    expect(media?.schema?.oneOf).toHaveLength(SUPPORTED_TYPES.length);
    expect(media?.schema?.discriminator).toBeUndefined();
    for (const alternative of media?.schema?.oneOf ?? []) {
      expect(resolveRef(alternative).additionalProperties).not.toBe(false);
    }

    expect(Object.keys(media?.examples ?? {}).sort()).toEqual(
      [...SUPPORTED_TYPES].sort(),
    );
    for (const typeName of SUPPORTED_TYPES) {
      const example = media?.examples?.[typeName]?.value;
      expect(getWebhookSchema(typeName)?.safeParse(example).success).toBe(true);
    }
  });

  it("documents the strict channel payload and validates its safe example", () => {
    const media = channel.requestBody?.content?.["application/json"];
    const schema = resolveRef(media?.schema ?? {});
    expect(channel.requestBody?.required).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["content"]);
    expect(schema.properties?.content).toMatchObject({
      minLength: 1,
      maxLength: 4000,
    });
    expect(schema.properties?.author).toMatchObject({
      minLength: 1,
      maxLength: 80,
    });
    expect(channelWebhookPayloadSchema.safeParse(media?.example).success).toBe(
      true,
    );
    expect(
      channelWebhookPayloadSchema.safeParse({
        ...(media?.example as Record<string, unknown>),
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("keeps channel idempotency keys within printable ASCII limits", () => {
    const idempotency = parameter(channel, "Idempotency-Key", "header");
    expect(idempotency.required).toBe(false);
    expect(idempotency.schema).toMatchObject({ minLength: 1, maxLength: 128 });
    const pattern = new RegExp(idempotency.schema?.pattern ?? "(?!)");
    expect(pattern.test(" ")).toBe(true);
    expect(pattern.test("Example-Key-123")).toBe(true);
    expect(pattern.test("~")).toBe(true);
    expect(pattern.test("\n")).toBe(false);
    expect(pattern.test("é")).toBe(false);

    for (const valid of [" ", "x".repeat(128), "Example-Key-123"]) {
      expect(idempotencyKeySchema.safeParse(valid).success).toBe(true);
    }
    for (const invalid of ["", "x".repeat(129), "\n", "é"]) {
      expect(idempotencyKeySchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("distinguishes bearer authentication from the sensitive channel path", () => {
    expect(typed.security).toEqual([{ WebhookBearer: [] }]);
    expect(spec.components?.securitySchemes?.WebhookBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(channel.security).toEqual([]);

    const webhookId = parameter(channel, "webhookId", "path");
    const token = parameter(channel, "token", "path");
    expect(webhookId.required).toBe(true);
    expect(token.required).toBe(true);
    expect(token.schema).toMatchObject({
      format: "password",
      "x-sensitive": true,
    });
    expect(token.schema?.example).toBeUndefined();
    expect(token.schema?.default).toBeUndefined();
  });

  it("keeps success and error response models distinct", () => {
    const success = spec.components?.schemas?.WebhookSuccess;
    const legacyError = spec.components?.schemas?.LegacyWebhookError;
    const simpleError = spec.components?.schemas?.ChannelSimpleError;
    const validationError = spec.components?.schemas?.ChannelValidationError;

    for (const operation of [typed, channel]) {
      expect(Object.keys(operation.responses ?? {})).toEqual(responseStatuses);
      expect(responseSchema(operation, "200")).toBe(success);
      expect(responseSchema(operation, "201")).toBe(success);
      expect(operation.responses?.["500"]?.description).toBeTruthy();
      expect(operation.responses?.["500"]?.content).toBeUndefined();
    }
    for (const status of ["400", "401", "413", "429"]) {
      expect(responseSchema(typed, status)).toBe(legacyError);
    }

    const channel400 =
      channel.responses?.["400"]?.content?.["application/json"]?.schema?.oneOf;
    expect(channel400).toHaveLength(2);
    expect(resolveRef(channel400?.[0] ?? {})).toBe(simpleError);
    expect(resolveRef(channel400?.[1] ?? {})).toBe(validationError);
    for (const status of ["401", "413", "429"]) {
      expect(responseSchema(channel, status)).toBe(simpleError);
    }
    expect(channel.responses?.["500"]?.headers).toBeUndefined();
  });

  it("limits retry and channel security headers to their runtime contracts", () => {
    const securityHeaders = [
      "Cache-Control",
      "Referrer-Policy",
      "X-Content-Type-Options",
    ];
    const handledChannelStatuses = ["200", "201", "400", "401", "413", "429"];
    for (const operation of [typed, channel]) {
      expect(
        operation.responses?.["429"]?.headers?.["Retry-After"],
      ).toBeTruthy();
      for (const status of responseStatuses.filter(
        (value) => value !== "429",
      )) {
        expect(
          operation.responses?.[status]?.headers?.["Retry-After"],
        ).toBeUndefined();
      }
    }
    for (const status of handledChannelStatuses) {
      for (const header of securityHeaders) {
        expect(channel.responses?.[status]?.headers?.[header]).toBeTruthy();
      }
    }
  });

  it("contains no workspace context, external URL, or credential examples", () => {
    expect(JSON.stringify(spec)).not.toMatch(/x-inspoter-workspace/i);
    expect(
      collectStringValues(spec).filter((value) => /^https?:\/\//i.test(value)),
    ).toEqual([]);
    expect(forbiddenExampleEntries(spec)).toEqual([]);
  });

  it("documents the strict metrics payload and validates its safe example", () => {
    const media = metrics.requestBody?.content?.["application/json"];
    const schema = resolveRef(media?.schema ?? {});
    expect(metrics.requestBody?.required).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "schemaVersion",
        "agentVersion",
        "capturedAt",
        "hostname",
        "ips",
        "cpu",
        "memory",
        "filesystem",
        "uptimeSeconds",
      ]),
    );
    expect(schema.properties?.schemaVersion).toMatchObject({ const: 1 });
    expect(schema.properties?.hostname).toMatchObject({
      minLength: 1,
      maxLength: 255,
    });
    expect(schema.properties?.agentVersion).toMatchObject({
      minLength: 1,
      maxLength: 64,
    });

    const ipsSchema = schema.properties?.ips;
    expect(ipsSchema).toMatchObject({ minItems: 1, maxItems: 16 });

    expect(validateMetricsPayload(media?.example).success).toBe(true);
  });

  it("uses bearer auth for metrics ingestion", () => {
    expect(metrics.security).toEqual([{ WebhookBearer: [] }]);
  });

  it("keeps metrics success and error response models distinct", () => {
    const metricsSuccess = spec.components?.schemas?.MetricsSuccess;
    const metricsError = spec.components?.schemas?.MetricsError;

    expect(Object.keys(metrics.responses ?? {}).sort()).toEqual(
      [...metricsResponseStatuses].sort(),
    );
    expect(responseSchema(metrics, "200")).toBe(metricsSuccess);
    expect(responseSchema(metrics, "201")).toBe(metricsSuccess);
    for (const status of ["400", "401", "409", "413", "422", "429", "503"]) {
      expect(responseSchema(metrics, status)).toBe(metricsError);
    }
    expect(metrics.responses?.["500"]?.description).toBeTruthy();
    expect(metrics.responses?.["500"]?.content).toBeUndefined();
  });

  it("sets Cache-Control and Retry-After headers on metrics responses", () => {
    const handledStatuses = metricsResponseStatuses.filter(
      (s) => s !== "500",
    );
    for (const status of handledStatuses) {
      expect(
        metrics.responses?.[status]?.headers?.["Cache-Control"],
      ).toBeTruthy();
    }
    expect(metrics.responses?.["500"]?.headers).toBeUndefined();

    expect(
      metrics.responses?.["429"]?.headers?.["Retry-After"],
    ).toBeTruthy();
    for (const status of metricsResponseStatuses.filter(
      (s) => s !== "429",
    )) {
      expect(
        metrics.responses?.[status]?.headers?.["Retry-After"],
      ).toBeUndefined();
    }
  });
});
