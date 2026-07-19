import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CATALOG_VERSION = 1;
const ACCOUNT_KEY = "mock:v1";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const DOMAIN_PROVIDERS = new Set(["cloudflare", "godaddy", "hetzner"]);
const DNS_RECORD_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "TXT"]);
const SERVER_STATUSES = new Set(["running", "stopped"]);
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const CATALOG_PATH = resolve(
  REPOSITORY_ROOT,
  "prisma",
  "mock-provider-resources.v1.json",
);
export const MIGRATION_PATH = resolve(
  REPOSITORY_ROOT,
  "prisma",
  "migrations",
  "20260714090000_q13_workspace_ownership",
  "migration.sql",
);
const REGION_MARKERS = [
  "Q13_MOCK_CATALOG_VERSION",
  "Q13_MOCK_CATALOG_SHA256",
  "Q13_MOCK_CATALOG_BYTE_LENGTH",
  "Q13_MOCK_VALUES_BEGIN",
  "Q13_MOCK_VALUES_END",
];

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) fail(path, "must be a JSON object");
}

function assertExactKeys(value, expectedKeys, path) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    fail(
      path,
      `must contain exactly [${expected.join(", ")}], received [${actualKeys.join(", ")}]`,
    );
  }
}

function assertString(value, path, { maxBytes, identity = false } = {}) {
  if (typeof value !== "string") fail(path, "must be a string");
  if (value.length === 0) fail(path, "must not be empty");
  if (value !== value.trim()) fail(path, "must be trimmed");
  if (CONTROL_CHARACTER.test(value)) {
    fail(path, "must not contain control characters");
  }
  if (maxBytes !== undefined && Buffer.byteLength(value, "utf8") > maxBytes) {
    fail(path, `must be at most ${maxBytes} UTF-8 bytes`);
  }
  if (identity && value.includes(":")) {
    fail(path, "must not contain ':' because it is an identity separator");
  }
}

function compareResources(left, right) {
  return (
    left.resourceType.localeCompare(right.resourceType, "en") ||
    left.provider.localeCompare(right.provider, "en") ||
    left.key.localeCompare(right.key, "en")
  );
}

function validateRecord(record, path) {
  assertPlainObject(record, path);
  assertExactKeys(record, ["id", "type", "name", "value", "ttl"], path);
  assertString(record.id, `${path}.id`, { maxBytes: 256, identity: true });
  assertString(record.type, `${path}.type`, { maxBytes: 16 });
  if (!DNS_RECORD_TYPES.has(record.type)) {
    fail(`${path}.type`, `unsupported DNS record type '${record.type}'`);
  }
  assertString(record.name, `${path}.name`, { maxBytes: 255 });
  assertString(record.value, `${path}.value`, { maxBytes: 4096 });
  if (
    !Number.isInteger(record.ttl) ||
    record.ttl < 1 ||
    record.ttl > 2_147_483_647
  ) {
    fail(`${path}.ttl`, "must be an integer from 1 through 2147483647");
  }

  return {
    id: record.id,
    type: record.type,
    name: record.name,
    value: record.value,
    ttl: record.ttl,
  };
}

function validateDomain(resource, path) {
  assertExactKeys(
    resource,
    ["provider", "resourceType", "key", "displayName", "records"],
    path,
  );
  if (!DOMAIN_PROVIDERS.has(resource.provider)) {
    fail(`${path}.provider`, "DOMAIN supports cloudflare, godaddy, or hetzner");
  }
  if (!Array.isArray(resource.records))
    fail(`${path}.records`, "must be an array");

  const records = resource.records.map((record, index) =>
    validateRecord(record, `${path}.records[${index}]`),
  );
  records.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const recordIds = new Set();
  for (const record of records) {
    if (recordIds.has(record.id)) {
      fail(`${path}.records`, `duplicate DNS record id '${record.id}'`);
    }
    recordIds.add(record.id);
  }

  return {
    provider: resource.provider,
    resourceType: resource.resourceType,
    key: resource.key,
    displayName: resource.displayName,
    records,
  };
}

function validateServer(resource, path) {
  assertExactKeys(
    resource,
    [
      "provider",
      "resourceType",
      "key",
      "displayName",
      "serverType",
      "status",
      "cpu",
      "ram",
      "disk",
      "ip",
      "location",
      "os",
    ],
    path,
  );
  if (resource.provider !== "hetzner") {
    fail(`${path}.provider`, "SERVER supports only hetzner");
  }
  assertString(resource.serverType, `${path}.serverType`, { maxBytes: 512 });
  assertString(resource.status, `${path}.status`, { maxBytes: 32 });
  if (!SERVER_STATUSES.has(resource.status)) {
    fail(`${path}.status`, "must be a stable running or stopped seed status");
  }
  for (const field of ["cpu", "ram", "disk", "ip", "location", "os"]) {
    assertString(resource[field], `${path}.${field}`, { maxBytes: 512 });
  }

  return {
    provider: resource.provider,
    resourceType: resource.resourceType,
    key: resource.key,
    displayName: resource.displayName,
    serverType: resource.serverType,
    status: resource.status,
    cpu: resource.cpu,
    ram: resource.ram,
    disk: resource.disk,
    ip: resource.ip,
    location: resource.location,
    os: resource.os,
  };
}

function validateResource(resource, path) {
  assertPlainObject(resource, path);
  assertString(resource.provider, `${path}.provider`, {
    maxBytes: 64,
    identity: true,
  });
  assertString(resource.resourceType, `${path}.resourceType`, { maxBytes: 16 });
  assertString(resource.key, `${path}.key`, { maxBytes: 256, identity: true });
  assertString(resource.displayName, `${path}.displayName`, { maxBytes: 512 });

  if (resource.resourceType === "DOMAIN") return validateDomain(resource, path);
  if (resource.resourceType === "SERVER") return validateServer(resource, path);
  fail(`${path}.resourceType`, "must be DOMAIN or SERVER");
}

export function validateCatalog(input, label = "catalog") {
  assertPlainObject(input, label);
  assertExactKeys(input, ["version", "accountKey", "resources"], label);
  if (input.version !== CATALOG_VERSION) {
    fail(`${label}.version`, `must be exactly ${CATALOG_VERSION}`);
  }
  if (input.accountKey !== ACCOUNT_KEY) {
    fail(`${label}.accountKey`, `must be exactly '${ACCOUNT_KEY}'`);
  }
  assertString(input.accountKey, `${label}.accountKey`, { maxBytes: 256 });
  if (!Array.isArray(input.resources))
    fail(`${label}.resources`, "must be an array");

  const resources = input.resources.map((resource, index) =>
    validateResource(resource, `${label}.resources[${index}]`),
  );
  resources.sort(compareResources);

  const identities = new Set();
  for (const resource of resources) {
    const identity = `${resource.provider}\0${resource.resourceType}\0${resource.key}`;
    if (identities.has(identity)) {
      fail(
        `${label}.resources`,
        `duplicate identity (${resource.provider}, ${resource.resourceType}, ${resource.key})`,
      );
    }
    identities.add(identity);
  }

  return { version: input.version, accountKey: input.accountKey, resources };
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeValue(value[key])]),
  );
}

export function canonicalizeCatalog(input) {
  return JSON.stringify(canonicalizeValue(validateCatalog(input)));
}

export function parseCatalogText(text, label = "catalog") {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(label, "must contain valid JSON");
  }
  return validateCatalog(parsed, label);
}

export function loadCatalog(path = CATALOG_PATH) {
  return parseCatalogText(readFileSync(path, "utf8"), path);
}

export function getCatalogMetadata(input) {
  const catalog = validateCatalog(input);
  const canonicalBytes = Buffer.from(
    JSON.stringify(canonicalizeValue(catalog)),
    "utf8",
  );
  return {
    version: catalog.version,
    sha256: createHash("sha256").update(canonicalBytes).digest("hex"),
    byteLength: canonicalBytes.byteLength,
    resourceCount: catalog.resources.length,
  };
}

export function getBindingRows(input) {
  return validateCatalog(input).resources.map(
    ({ provider, resourceType, key, displayName }) => ({
      provider,
      resourceType,
      key,
      displayName,
    }),
  );
}

function quoteSqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderSqlValues(input) {
  const catalog = validateCatalog(input);
  const metadata = getCatalogMetadata(catalog);
  const rows = getBindingRows(catalog).map(
    ({ provider, resourceType, key, displayName }) =>
      `  (${[provider, resourceType, key, displayName].map(quoteSqlLiteral).join(", ")})`,
  );

  return [
    `-- Q13_MOCK_CATALOG_VERSION: ${metadata.version}`,
    `-- Q13_MOCK_CATALOG_SHA256: ${metadata.sha256}`,
    `-- Q13_MOCK_CATALOG_BYTE_LENGTH: ${metadata.byteLength}`,
    "-- Q13_MOCK_VALUES_BEGIN",
    "VALUES",
    `${rows.join(",\n")}`,
    "-- Q13_MOCK_VALUES_END",
  ].join("\n");
}

function extractMigrationRegion(text, label) {
  const lines = text.split(/\r?\n/u);
  for (const marker of REGION_MARKERS) {
    const prefix = `-- ${marker}`;
    const count = lines.filter((line) => {
      const trimmed = line.trimStart();
      return (
        trimmed === prefix ||
        trimmed.startsWith(`${prefix}:`) ||
        trimmed.startsWith(`${prefix} `)
      );
    }).length;
    if (count !== 1)
      fail(label, `expected exactly one ${marker} marker, received ${count}`);
  }

  const header = "-- Q13_MOCK_CATALOG_VERSION:";
  const end = "-- Q13_MOCK_VALUES_END";
  const headerIndex = text.indexOf(header);
  const endIndex = text.indexOf(end);
  if (headerIndex === -1) fail(label, "catalog version header is malformed");
  if (endIndex < headerIndex)
    fail(label, "catalog region markers are out of order");
  const start = text.lastIndexOf("\n", headerIndex - 1) + 1;
  const nextLine = text.indexOf("\n", endIndex);
  let finish = nextLine === -1 ? text.length : nextLine;
  if (finish > 0 && text[finish - 1] === "\r") finish -= 1;
  return text.slice(start, finish);
}

export function assertMigrationCatalogParity(text, input, label = "migration") {
  const expected = Buffer.from(renderSqlValues(input), "utf8");
  const actual = Buffer.from(extractMigrationRegion(text, label), "utf8");
  if (!actual.equals(expected)) {
    let mismatch = 0;
    while (
      mismatch < actual.length &&
      mismatch < expected.length &&
      actual[mismatch] === expected[mismatch]
    )
      mismatch += 1;
    fail(
      label,
      `catalog SQL region differs at UTF-8 byte ${mismatch} (expected ${expected.length} bytes, received ${actual.length})`,
    );
  }
  return getCatalogMetadata(input);
}

function serializeMetadata(metadata) {
  return JSON.stringify(metadata);
}

function runCli(argv) {
  if (argv.length !== 1 || !["render", "metadata", "check"].includes(argv[0])) {
    fail("command", "expected exactly one of: render, metadata, check");
  }
  const catalog = loadCatalog();
  if (argv[0] === "render") return renderSqlValues(catalog);
  if (argv[0] === "check") {
    assertMigrationCatalogParity(
      readFileSync(MIGRATION_PATH, "utf8"),
      catalog,
      MIGRATION_PATH,
    );
  }
  return serializeMetadata(getCatalogMetadata(catalog));
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  try {
    process.stdout.write(`${runCli(process.argv.slice(2))}\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown validation error";
    process.stderr.write(`[mock-provider-catalog] ${message}\n`);
    process.exitCode = 1;
  }
}
