import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertMigrationCatalogParity,
  canonicalizeCatalog,
  CATALOG_PATH,
  getBindingRows,
  getCatalogMetadata,
  MIGRATION_PATH,
  parseCatalogText,
  renderSqlValues,
  validateCatalog,
} from "../../scripts/mock-provider-catalog.mjs";

interface CatalogResource {
  provider: string;
  resourceType: string;
  key: string;
  displayName: string;
  [field: string]: unknown;
}

interface CatalogFixture {
  version: number;
  accountKey: string;
  resources: CatalogResource[];
}

const sourceText = readFileSync(CATALOG_PATH, "utf8");
const sourceCatalog = JSON.parse(sourceText) as CatalogFixture;
const migrationText = readFileSync(MIGRATION_PATH, "utf8");

function cloneCatalog(): CatalogFixture {
  return JSON.parse(JSON.stringify(sourceCatalog)) as CatalogFixture;
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseObjectKeys(item)]),
  );
}

describe("canonical mock provider catalog", () => {
  it("reports stable version, hash, byte length, and the exact resource count", () => {
    const metadata = getCatalogMetadata(sourceCatalog);

    expect(metadata).toEqual({
      version: 1,
      sha256:
        "9300c300ac65be69ad6bf62720a6f0e16ec5e10d4a880deeed87e4da8b463f4b",
      byteLength: 3304,
      resourceCount: 13,
    });
  });

  it("matches the checked-in migration region byte for byte", () => {
    expect(assertMigrationCatalogParity(migrationText, sourceCatalog)).toEqual({
      version: 1,
      sha256:
        "9300c300ac65be69ad6bf62720a6f0e16ec5e10d4a880deeed87e4da8b463f4b",
      byteLength: 3304,
      resourceCount: 13,
    });
  });

  it.each([
    [
      "header",
      (text: string) =>
        text.replace(
          "9300c300ac65be69ad6bf62720a6f0e16ec5e10d4a880deeed87e4da8b463f4b",
          "0300c300ac65be69ad6bf62720a6f0e16ec5e10d4a880deeed87e4da8b463f4b",
        ),
    ],
    [
      "row",
      (text: string) =>
        text.replace(
          "('cloudflare', 'DOMAIN', 'cf-example-com', 'example.com')",
          "('cloudflare', 'DOMAIN', 'cf-example-com', 'example.net')",
        ),
    ],
    [
      "whitespace",
      (text: string) => text.replace("  ('cloudflare'", "   ('cloudflare'"),
    ],
  ])("rejects %s drift in the migration region", (_name, mutate) => {
    expect(() =>
      assertMigrationCatalogParity(mutate(migrationText), sourceCatalog),
    ).toThrow("catalog SQL region differs at UTF-8 byte");
  });

  it("rejects duplicate or missing migration region markers", () => {
    const duplicate = `${migrationText}\n${renderSqlValues(sourceCatalog)}`;
    const missing = migrationText.replace("-- Q13_MOCK_VALUES_END", "");
    expect(() =>
      assertMigrationCatalogParity(duplicate, sourceCatalog),
    ).toThrow(
      "expected exactly one Q13_MOCK_CATALOG_VERSION marker, received 2",
    );
    expect(() => assertMigrationCatalogParity(missing, sourceCatalog)).toThrow(
      "expected exactly one Q13_MOCK_VALUES_END marker, received 0",
    );
  });

  it("rejects same-version nested catalog drift", () => {
    const catalog = cloneCatalog();
    const domain = catalog.resources.find(
      (resource) => resource.resourceType === "DOMAIN",
    );
    expect(domain).toBeDefined();
    const records = domain!.records as Array<{ value: string }>;
    records[0].value = "203.0.113.250";
    expect(() => assertMigrationCatalogParity(migrationText, catalog)).toThrow(
      "catalog SQL region differs at UTF-8 byte",
    );
  });

  it("canonicalizes independently of source whitespace and object key order", () => {
    const reordered = JSON.stringify(reverseObjectKeys(sourceCatalog), null, 7);
    const parsedReordered = parseCatalogText(reordered, "reordered catalog");

    expect(canonicalizeCatalog(parsedReordered)).toBe(
      canonicalizeCatalog(parseCatalogText(sourceText)),
    );
    expect(getCatalogMetadata(parsedReordered)).toEqual(
      getCatalogMetadata(sourceCatalog),
    );
  });

  it("produces the exact 13 unique workspace-scoped binding identities", () => {
    const identities = getBindingRows(sourceCatalog).map(
      ({
        provider,
        resourceType,
        key,
      }: {
        provider: string;
        resourceType: string;
        key: string;
      }) =>
        `${provider}|mock:v1|${resourceType}|MOCK|mock:v1:workspace-1:${provider}:${key}`,
    );

    expect(identities).toEqual([
      "cloudflare|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:cloudflare:cf-example-com",
      "cloudflare|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:cloudflare:cf-example-dev",
      "godaddy|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:godaddy:gd-blog-app",
      "godaddy|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:godaddy:gd-mysite-com",
      "godaddy|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:godaddy:gd-shop-io",
      "hetzner|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:hetzner:hz-example-de",
      "hetzner|mock:v1|DOMAIN|MOCK|mock:v1:workspace-1:hetzner:hz-myserver-net",
      "hetzner|mock:v1|SERVER|MOCK|mock:v1:workspace-1:hetzner:srv-01",
      "hetzner|mock:v1|SERVER|MOCK|mock:v1:workspace-1:hetzner:srv-02",
      "hetzner|mock:v1|SERVER|MOCK|mock:v1:workspace-1:hetzner:srv-03",
      "hetzner|mock:v1|SERVER|MOCK|mock:v1:workspace-1:hetzner:srv-04",
      "hetzner|mock:v1|SERVER|MOCK|mock:v1:workspace-1:hetzner:srv-05",
      "hetzner|mock:v1|SERVER|MOCK|mock:v1:workspace-1:hetzner:srv-06",
    ]);
    expect(new Set(identities)).toHaveLength(13);
  });

  it("renders an immutable marked 13-row SQL VALUES region with escaped literals", () => {
    const catalog = cloneCatalog();
    catalog.resources[0].displayName = "O'Reilly.example";

    const sql = renderSqlValues(catalog);
    const sqlRows = sql.split("\n").filter((line) => line.startsWith("  ("));

    expect(sql).toContain("-- Q13_MOCK_CATALOG_VERSION: 1");
    expect(sql).toMatch(/-- Q13_MOCK_CATALOG_SHA256: [a-f0-9]{64}/);
    expect(sql).toMatch(/-- Q13_MOCK_CATALOG_BYTE_LENGTH: \d+/);
    expect(sql).toContain("-- Q13_MOCK_VALUES_BEGIN\nVALUES\n");
    expect(sql).toContain("'O''Reilly.example'");
    expect(sql.endsWith("-- Q13_MOCK_VALUES_END")).toBe(true);
    expect(sqlRows).toHaveLength(13);
  });

  it("rejects a provider/resource pair outside the allowlist", () => {
    const catalog = cloneCatalog();
    const server = catalog.resources.find(
      (resource) => resource.resourceType === "SERVER",
    );
    expect(server).toBeDefined();
    server!.provider = "cloudflare";

    expect(() => validateCatalog(catalog)).toThrow(
      "SERVER supports only hetzner",
    );
  });

  it("rejects control characters in identity fields", () => {
    const catalog = cloneCatalog();
    catalog.resources[0].displayName = "example.com\nforged";

    expect(() => validateCatalog(catalog)).toThrow("control characters");
  });

  it("rejects duplicate provider-local identities", () => {
    const catalog = cloneCatalog();
    catalog.resources.push(
      JSON.parse(JSON.stringify(catalog.resources[0])) as CatalogResource,
    );

    expect(() => validateCatalog(catalog)).toThrow("duplicate identity");
  });

  it.each([
    [
      "version",
      (catalog: CatalogFixture) => (catalog.version = 2),
      "must be exactly 1",
    ],
    [
      "account key",
      (catalog: CatalogFixture) => (catalog.accountKey = "mock:v2"),
      "must be exactly 'mock:v1'",
    ],
  ])("rejects an invalid %s", (_name, mutate, expectedMessage) => {
    const catalog = cloneCatalog();
    mutate(catalog);

    expect(() => validateCatalog(catalog)).toThrow(expectedMessage);
  });

  it("enforces UTF-8 byte limits rather than JavaScript character counts", () => {
    const catalog = cloneCatalog();
    catalog.resources[0].displayName = "é".repeat(257);

    expect(() => validateCatalog(catalog)).toThrow(
      "must be at most 512 UTF-8 bytes",
    );
  });
});
