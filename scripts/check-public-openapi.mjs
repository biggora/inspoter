import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const specPath = path.join(repoRoot, "specs", "openapi.json");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function resolveLocalRef(spec, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], spec);
}

function resolveParameter(spec, parameter) {
  return parameter?.$ref ? resolveLocalRef(spec, parameter.$ref) : parameter;
}

function resolveSchema(spec, schema) {
  return schema?.$ref ? resolveLocalRef(spec, schema.$ref) : schema;
}

function jsonResponseSchema(response) {
  return resolveSchema(spec, response?.content?.["application/json"]?.schema);
}

function hasKeyDeep(value, keyNames) {
  if (!value || typeof value !== "object") return false;
  if (Object.keys(value).some((key) => keyNames.has(key))) return true;
  return Object.values(value).some((child) => hasKeyDeep(child, keyNames));
}

function collectStringValues(value, location = "spec", result = []) {
  if (typeof value === "string") {
    result.push({ location, value });
  } else if (Array.isArray(value)) {
    value.forEach((child, index) =>
      collectStringValues(child, `${location}[${index}]`, result),
    );
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) =>
      collectStringValues(child, `${location}.${key}`, result),
    );
  }
  return result;
}

function findSensitiveExampleProperties(
  value,
  location = "spec",
  insideExample = false,
  result = [],
) {
  if (!value || typeof value !== "object") return result;
  const sensitiveName =
    /(?:token|authorization|api[-_]?key|api[-_]?secret|password|secret|bearer)/i;
  const exampleContainer = /^(?:example|examples|default)$/i;
  for (const [key, child] of Object.entries(value)) {
    const childLocation = `${location}.${key}`;
    if (insideExample && sensitiveName.test(key)) result.push(childLocation);
    findSensitiveExampleProperties(
      child,
      childLocation,
      insideExample || exampleContainer.test(key),
      result,
    );
  }
  return result;
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
} catch (error) {
  console.error(
    `Public OpenAPI contract check failed: cannot parse ${specPath}: ${error.message}`,
  );
  process.exit(1);
}

const discordPath = "/api/discord/webhooks/{webhookId}/{token}";
const messagesBase = "/api/v1/messages";
const contactsBase = "/api/v1/contacts";
// The ingest and MCP surfaces are POST-only; the Discord webhook is also
// readable (Get Webhook with Token), and the Messages management API is a
// regular REST family, so the allowed methods are pinned per path.
const expectedMethods = {
  [discordPath]: ["get", "post"],
  [`${discordPath}/slack`]: ["post"],
  "/api/mcp": ["post"],
  "/api/server-metrics": ["post"],
  "/api/webhooks/channels/{webhookId}/{token}": ["post"],
  "/api/webhooks/{type}": ["post"],
  [`${messagesBase}/categories`]: ["get", "post"],
  [`${messagesBase}/categories/{categoryId}`]: ["patch"],
  [`${messagesBase}/channels`]: ["post"],
  [`${messagesBase}/channels/{channelId}`]: ["patch"],
  [`${messagesBase}/channels/{channelId}/messages`]: ["get", "post"],
  [`${messagesBase}/channels/{channelId}/webhooks`]: ["get", "post"],
  [`${messagesBase}/channels/{channelId}/webhooks/{webhookId}`]: ["delete"],
  [contactsBase]: ["get", "post"],
  [`${contactsBase}/labels`]: ["get", "post"],
  [`${contactsBase}/{contactId}`]: ["delete", "get", "patch"],
};
const expectedPaths = Object.keys(expectedMethods).sort();
const actualPaths = Object.keys(spec.paths ?? {}).sort();
check(
  sameJson(actualPaths, expectedPaths),
  `paths must be exactly ${expectedPaths.join(", ")}; found ${actualPaths.join(", ") || "none"}`,
);
check(
  spec.openapi === "3.1.1",
  `openapi must be "3.1.1"; found ${spec.openapi}`,
);
check(
  sameJson(spec.servers, [{ url: "/" }]),
  'servers must be exactly [{"url":"/"}]',
);

for (const publicPath of expectedPaths) {
  const methods = Object.keys(spec.paths?.[publicPath] ?? {}).sort();
  const allowed = [...expectedMethods[publicPath]].sort();
  check(
    sameJson(methods, allowed),
    `${publicPath} must contain only ${allowed.join(" and ")}; found ${methods.join(", ") || "none"}`,
  );
}

const metricsPath = "/api/server-metrics";
const typedPath = "/api/webhooks/{type}";
const channelPath = "/api/webhooks/channels/{webhookId}/{token}";
const metrics = spec.paths?.[metricsPath]?.post;
const typed = spec.paths?.[typedPath]?.post;
const channel = spec.paths?.[channelPath]?.post;
const allOperations = Object.entries(spec.paths ?? {}).flatMap(
  ([publicPath, item]) =>
    Object.entries(item).map(([method, operation]) => ({
      label: `${method.toUpperCase()} ${publicPath}`,
      publicPath,
      operation,
    })),
);
const operationIds = allOperations.map(
  ({ operation }) => operation.operationId,
);
check(
  operationIds.every(
    (operationId) =>
      typeof operationId === "string" && operationId.trim().length > 0,
  ),
  "all operations must have non-empty operationId values",
);
check(
  new Set(operationIds).size === operationIds.length,
  "operationId values must be unique",
);

// The Messages management API is one uniform family: every operation is bearer
// authenticated, answers the same auth/limit statuses, and never leaks a
// response body on 500.
const messagesApiError = spec.components?.schemas?.MessagesApiError;
check(
  messagesApiError?.type === "object" &&
    sameJson(messagesApiError?.required, ["error"]) &&
    messagesApiError?.properties?.error?.type === "object" &&
    sameJson(messagesApiError.properties.error.required, ["code", "message"]),
  "components.schemas.MessagesApiError must be a nested error envelope requiring string code and message",
);
for (const { label, publicPath, operation } of allOperations) {
  if (!publicPath.startsWith("/api/v1/")) continue;
  check(
    sameJson(operation.security, [{ WebhookBearer: [] }]),
    `${label} security must be exactly [{"WebhookBearer":[]}]`,
  );
  for (const status of ["401", "403", "429"]) {
    check(
      jsonResponseSchema(operation.responses?.[status]) === messagesApiError,
      `${label} response ${status} must resolve to components.schemas.MessagesApiError`,
    );
  }
  check(
    Boolean(operation.responses?.["401"]?.headers?.["WWW-Authenticate"]),
    `${label} response 401 must define WWW-Authenticate`,
  );
  check(
    Boolean(operation.responses?.["429"]?.headers?.["Retry-After"]),
    `${label} response 429 must define Retry-After`,
  );
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (status === "500") {
      check(
        typeof response.description === "string" &&
          response.description.trim().length > 0 &&
          response.content === undefined &&
          response.headers === undefined,
        `${label} response 500 must have a description, no content, and no headers`,
      );
      continue;
    }
    check(
      Boolean(response.headers?.["Cache-Control"]),
      `${label} response ${status} must define Cache-Control`,
    );
    check(
      status === "429" || response.headers?.["Retry-After"] === undefined,
      `${label} response ${status} must not define Retry-After`,
    );
  }
}

const routeSources = [
  [metricsPath, "src/app/api/server-metrics/route.ts"],
  [typedPath, "src/app/api/webhooks/[type]/route.ts"],
  [channelPath, "src/app/api/webhooks/channels/[webhookId]/[token]/route.ts"],
  [discordPath, "src/app/api/discord/webhooks/[webhookId]/[token]/route.ts"],
  [
    `${discordPath}/slack`,
    "src/app/api/discord/webhooks/[webhookId]/[token]/slack/route.ts",
  ],
];
for (const [publicPath, relativeSource] of routeSources) {
  const sourcePath = path.join(repoRoot, relativeSource);
  let source = "";
  try {
    source = fs.readFileSync(sourcePath, "utf8");
  } catch (error) {
    failures.push(
      `${publicPath} source cannot be read at ${relativeSource}: ${error.message}`,
    );
    continue;
  }
  check(
    /export\s+async\s+function\s+POST\s*\(/.test(source),
    `${relativeSource} must export async function POST(...)`,
  );
}

check(
  sameJson(metrics?.security, [{ WebhookBearer: [] }]),
  `${metricsPath} security must be exactly [{"WebhookBearer":[]}]`,
);
check(
  sameJson(typed?.security, [{ WebhookBearer: [] }]),
  `${typedPath} security must be exactly [{"WebhookBearer":[]}]`,
);
const bearer = spec.components?.securitySchemes?.WebhookBearer;
check(
  bearer?.type === "http" && bearer?.scheme === "bearer",
  "components.securitySchemes.WebhookBearer must be an HTTP bearer scheme",
);
check(
  sameJson(channel?.security, []),
  `${channelPath} security must be an explicit empty array`,
);

const typedParameters = (typed?.parameters ?? []).map((parameter) =>
  resolveParameter(spec, parameter),
);
const typeParameter = typedParameters.find(
  (parameter) => parameter?.in === "path" && parameter?.name === "type",
);
check(typeParameter?.required === true, "type path parameter must be required");
check(
  sameJson(typeParameter?.schema?.enum, ["log", "alert", "mail", "message"]),
  "type path parameter enum must be exactly log, alert, mail, message",
);

const channelParameters = (channel?.parameters ?? []).map((parameter) =>
  resolveParameter(spec, parameter),
);
for (const name of ["webhookId", "token"]) {
  const parameter = channelParameters.find(
    (candidate) => candidate?.in === "path" && candidate?.name === name,
  );
  check(
    parameter?.required === true,
    `${name} path parameter must be required`,
  );
}
const tokenParameter = channelParameters.find(
  (parameter) => parameter?.in === "path" && parameter?.name === "token",
);
check(
  tokenParameter?.schema?.format === "password" &&
    tokenParameter?.schema?.["x-sensitive"] === true,
  "token path parameter must use format password and x-sensitive true",
);
check(
  !hasKeyDeep(tokenParameter, new Set(["example", "default"])),
  "token path parameter must not define an example or default",
);

const webhookExpectedResponses = [
  "200",
  "201",
  "400",
  "401",
  "413",
  "429",
  "500",
];
for (const [label, operation] of [
  [typedPath, typed],
  [channelPath, channel],
]) {
  const responses = Object.keys(operation?.responses ?? {});
  check(
    sameJson(responses, webhookExpectedResponses),
    `${label} responses must be exactly ${webhookExpectedResponses.join(", ")}; found ${responses.join(", ") || "none"}`,
  );
  check(
    Boolean(operation?.responses?.["429"]?.headers?.["Retry-After"]),
    `${label} response 429 must define Retry-After`,
  );
}

const metricsExpectedResponses = [
  "200",
  "201",
  "400",
  "401",
  "409",
  "413",
  "422",
  "429",
  "500",
  "503",
];
{
  const responses = Object.keys(metrics?.responses ?? {});
  check(
    sameJson(responses, metricsExpectedResponses),
    `${metricsPath} responses must be exactly ${metricsExpectedResponses.join(", ")}; found ${responses.join(", ") || "none"}`,
  );
  check(
    Boolean(metrics?.responses?.["429"]?.headers?.["Retry-After"]),
    `${metricsPath} response 429 must define Retry-After`,
  );
  const handledStatuses = metricsExpectedResponses.filter((s) => s !== "500");
  for (const status of handledStatuses) {
    check(
      Boolean(metrics?.responses?.[status]?.headers?.["Cache-Control"]),
      `${metricsPath} response ${status} must define Cache-Control`,
    );
  }
  check(
    metrics?.responses?.["500"]?.headers === undefined,
    `${metricsPath} response 500 must not define headers`,
  );
}

const sharedSuccess = spec.components?.schemas?.WebhookSuccess;
check(
  sharedSuccess?.type === "object" &&
    sharedSuccess?.additionalProperties === false &&
    sameJson(sharedSuccess?.required, ["id"]) &&
    sameJson(Object.keys(sharedSuccess?.properties ?? {}), ["id"]) &&
    sharedSuccess?.properties?.id?.type === "string",
  "components.schemas.WebhookSuccess must be exactly an object requiring one string id property",
);
for (const [label, operation] of [
  [typedPath, typed],
  [channelPath, channel],
]) {
  for (const status of ["200", "201"]) {
    check(
      jsonResponseSchema(operation?.responses?.[status]) === sharedSuccess,
      `${label} response ${status} must resolve to components.schemas.WebhookSuccess`,
    );
  }
}

const legacyError = spec.components?.schemas?.LegacyWebhookError;
const nestedLegacyError = legacyError?.properties?.error;
check(
  legacyError?.type === "object" &&
    sameJson(legacyError?.required, ["error"]) &&
    nestedLegacyError?.type === "object" &&
    sameJson(nestedLegacyError?.required, ["code", "message"]) &&
    nestedLegacyError?.properties?.code?.type === "string" &&
    nestedLegacyError?.properties?.message?.type === "string",
  "components.schemas.LegacyWebhookError must be a nested error envelope requiring string code and message",
);
for (const status of ["400", "401", "413", "429"]) {
  check(
    jsonResponseSchema(typed?.responses?.[status]) === legacyError,
    `${typedPath} response ${status} must resolve to components.schemas.LegacyWebhookError`,
  );
}
check(
  typeof typed?.responses?.["500"]?.description === "string" &&
    typed.responses["500"].description.trim().length > 0 &&
    typed.responses["500"].content === undefined,
  `${typedPath} response 500 must have a description and no content`,
);

const channelSimpleError = spec.components?.schemas?.ChannelSimpleError;
const channelValidationError = spec.components?.schemas?.ChannelValidationError;
const zodIssueArray = spec.components?.schemas?.ZodIssueArray;
check(
  channelSimpleError?.type === "object" &&
    sameJson(channelSimpleError?.required, ["error"]) &&
    channelSimpleError?.properties?.error?.type === "string",
  "components.schemas.ChannelSimpleError must require a string error property",
);
check(
  channelValidationError?.type === "object" &&
    sameJson(channelValidationError?.required, ["error"]) &&
    resolveSchema(spec, channelValidationError?.properties?.error) ===
      zodIssueArray &&
    zodIssueArray?.type === "array",
  "components.schemas.ChannelValidationError must wrap components.schemas.ZodIssueArray in error",
);
const channel400Schema =
  channel?.responses?.["400"]?.content?.["application/json"]?.schema;
const channel400Alternatives = channel400Schema?.oneOf ?? [];
check(
  channel400Alternatives.length === 2 &&
    resolveSchema(spec, channel400Alternatives[0]) === channelSimpleError &&
    resolveSchema(spec, channel400Alternatives[1]) === channelValidationError,
  `${channelPath} response 400 must be exactly oneOf ChannelSimpleError and ChannelValidationError`,
);
for (const status of ["401", "413", "429"]) {
  check(
    jsonResponseSchema(channel?.responses?.[status]) === channelSimpleError,
    `${channelPath} response ${status} must resolve to components.schemas.ChannelSimpleError`,
  );
}
check(
  typeof channel?.responses?.["500"]?.description === "string" &&
    channel.responses["500"].description.trim().length > 0 &&
    channel.responses["500"].content === undefined &&
    channel.responses["500"].headers === undefined,
  `${channelPath} response 500 must have a description, no content, and no headers`,
);

for (const [label, operation] of [
  [typedPath, typed],
  [channelPath, channel],
]) {
  for (const status of webhookExpectedResponses.filter(
    (candidate) => candidate !== "429",
  )) {
    check(
      operation?.responses?.[status]?.headers?.["Retry-After"] === undefined,
      `${label} response ${status} must not define Retry-After`,
    );
  }
}

const channelSecurityHeaders = [
  "Cache-Control",
  "Referrer-Policy",
  "X-Content-Type-Options",
];
const handledChannelStatuses = ["200", "201", "400", "401", "413", "429"];
for (const status of handledChannelStatuses) {
  for (const header of channelSecurityHeaders) {
    check(
      Boolean(channel?.responses?.[status]?.headers?.[header]),
      `${channelPath} response ${status} must define ${header}`,
    );
  }
}

const typedRequestSchema =
  typed?.requestBody?.content?.["application/json"]?.schema;
check(
  typed?.requestBody?.required === true,
  `${typedPath} requestBody must be required`,
);
check(
  Array.isArray(typedRequestSchema?.oneOf) &&
    typedRequestSchema.oneOf.length === 4,
  `${typedPath} request schema must contain exactly four oneOf alternatives`,
);
check(
  !typedRequestSchema?.discriminator,
  `${typedPath} request schema must not define a discriminator`,
);
for (const [index, alternative] of (
  typedRequestSchema?.oneOf ?? []
).entries()) {
  const schema = alternative?.$ref
    ? resolveLocalRef(spec, alternative.$ref)
    : alternative;
  check(
    schema?.additionalProperties !== false,
    `${typedPath} oneOf alternative ${index + 1} must preserve permissive additional-property input semantics`,
  );
}

const legacyIdempotency = typedParameters.find(
  (parameter) =>
    parameter?.in === "header" && parameter?.name === "Idempotency-Key",
);
check(
  legacyIdempotency?.required === false &&
    legacyIdempotency?.schema?.type === "string" &&
    legacyIdempotency.schema.minLength === undefined &&
    legacyIdempotency.schema.maxLength === undefined &&
    legacyIdempotency.schema.pattern === undefined,
  "legacy Idempotency-Key must remain optional and unconstrained beyond string type",
);

const channelRequestSchemaOrRef =
  channel?.requestBody?.content?.["application/json"]?.schema;
const channelRequestSchema = channelRequestSchemaOrRef?.$ref
  ? resolveLocalRef(spec, channelRequestSchemaOrRef.$ref)
  : channelRequestSchemaOrRef;
check(
  channel?.requestBody?.required === true,
  `${channelPath} requestBody must be required`,
);
check(
  channelRequestSchema?.additionalProperties === false,
  `${channelPath} request schema must set additionalProperties to false`,
);
check(
  sameJson(channelRequestSchema?.required, ["content"]),
  `${channelPath} request schema must require only content`,
);
check(
  channelRequestSchema?.properties?.content?.minLength === 1 &&
    channelRequestSchema?.properties?.content?.maxLength === 4000,
  "channel content must have minLength 1 and maxLength 4000",
);
check(
  channelRequestSchema?.properties?.author?.minLength === 1 &&
    channelRequestSchema?.properties?.author?.maxLength === 80,
  "channel author must have minLength 1 and maxLength 80",
);

const channelIdempotency = channelParameters.find(
  (parameter) =>
    parameter?.in === "header" && parameter?.name === "Idempotency-Key",
);
check(
  channelIdempotency?.required === false &&
    channelIdempotency?.schema?.minLength === 1 &&
    channelIdempotency?.schema?.maxLength === 128,
  "channel Idempotency-Key must be optional with length 1 to 128",
);
try {
  const printableAscii = new RegExp(
    channelIdempotency?.schema?.pattern ?? "(?!)",
  );
  check(
    printableAscii.test(" ") &&
      printableAscii.test("Example-Key-123") &&
      printableAscii.test("~") &&
      !printableAscii.test("\n") &&
      !printableAscii.test("é"),
    "channel Idempotency-Key pattern must accept only printable ASCII",
  );
} catch {
  failures.push(
    "channel Idempotency-Key pattern must be a valid regular expression",
  );
}

const metricsError = spec.components?.schemas?.MetricsError;
check(
  metricsError?.type === "object" &&
    metricsError?.additionalProperties === false &&
    sameJson(metricsError?.required, ["error", "message"]) &&
    metricsError?.properties?.error?.type === "string" &&
    metricsError?.properties?.message?.type === "string",
  "components.schemas.MetricsError must be an object requiring string error and message properties",
);
for (const status of ["400", "401", "409", "413", "422", "429", "503"]) {
  check(
    jsonResponseSchema(metrics?.responses?.[status]) === metricsError,
    `${metricsPath} response ${status} must resolve to components.schemas.MetricsError`,
  );
}

const metricsSuccess = spec.components?.schemas?.MetricsSuccess;
check(
  metricsSuccess?.type === "object" &&
    metricsSuccess?.additionalProperties === false &&
    sameJson(metricsSuccess?.required, ["code", "localServerId"]) &&
    metricsSuccess?.properties?.code?.type === "string" &&
    metricsSuccess?.properties?.localServerId?.type === "string",
  "components.schemas.MetricsSuccess must be an object requiring string code and localServerId properties",
);
for (const status of ["200", "201"]) {
  check(
    jsonResponseSchema(metrics?.responses?.[status]) === metricsSuccess,
    `${metricsPath} response ${status} must resolve to components.schemas.MetricsSuccess`,
  );
}
check(
  typeof metrics?.responses?.["500"]?.description === "string" &&
    metrics.responses["500"].description.trim().length > 0 &&
    metrics.responses["500"].content === undefined,
  `${metricsPath} response 500 must have a description and no content`,
);

const metricsPayload = spec.components?.schemas?.ServerMetricsPayload;
check(
  metricsPayload?.type === "object" &&
    metricsPayload?.additionalProperties === false,
  "components.schemas.ServerMetricsPayload must be a strict object",
);
check(
  metrics?.requestBody?.required === true,
  `${metricsPath} requestBody must be required`,
);
const metricsRequestSchema = resolveSchema(
  spec,
  metrics?.requestBody?.content?.["application/json"]?.schema,
);
check(
  metricsRequestSchema === metricsPayload,
  `${metricsPath} request schema must resolve to components.schemas.ServerMetricsPayload`,
);

const serialized = JSON.stringify(spec);
check(
  !/x-inspoter-workspace/i.test(serialized),
  "specification must not contain X-Inspoter-Workspace",
);
for (const { location, value } of collectStringValues(spec)) {
  check(
    !/^https?:\/\//i.test(value),
    `${location} must not contain an external HTTP(S) URL`,
  );
  check(
    !/(?:\bsk-[A-Za-z0-9_-]{8,}|\bghp_[A-Za-z0-9]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}|\bAKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{8,})/.test(
      value,
    ),
    `${location} contains a secret-like value`,
  );
}
check(
  !hasKeyDeep(
    spec.components?.securitySchemes,
    new Set(["example", "default"]),
  ),
  "security scheme definitions must not contain examples or defaults",
);
for (const location of findSensitiveExampleProperties(spec)) {
  failures.push(
    `${location} must not define a credential-bearing property inside an example, examples, or default subtree`,
  );
}

if (failures.length > 0) {
  console.error(`Public OpenAPI contract check failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

// The Discord-compatible operations carry their own contract assertions in
// tests/unit/openapi/public-openapi.test.ts; this script pins the path
// inventory and the pre-Discord operations.
console.log(
  `Public OpenAPI contract check passed (${expectedPaths.length} paths).`,
);
