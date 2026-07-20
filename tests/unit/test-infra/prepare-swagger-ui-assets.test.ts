import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  EXPECTED_VERSION,
  prepareSwaggerUIAssets,
} from "../../../scripts/prepare-swagger-ui-assets.mjs";

const temporaryRoots: string[] = [];

async function createFixture({
  includeLicense = true,
  includeNotice = true,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "inspoter-swagger-assets-"));
  temporaryRoots.push(root);
  const packageDirectory = join(root, "package");
  const projectRoot = join(root, "project");
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    join(packageDirectory, "package.json"),
    JSON.stringify({ version: EXPECTED_VERSION }),
  );
  await writeFile(
    join(packageDirectory, "swagger-ui-bundle.js"),
    "webpackUniversalModuleDefinition;window.SwaggerUIBundle=function(){};",
  );
  if (includeLicense) {
    await writeFile(
      join(packageDirectory, "LICENSE"),
      "Synthetic Apache license",
    );
  }
  if (includeNotice) {
    await writeFile(join(packageDirectory, "NOTICE"), "Synthetic attribution");
  }
  return { packageDirectory, projectRoot };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("prepareSwaggerUIAssets", () => {
  it("copies the pinned bundle, license, and notice without rewriting unchanged files", async () => {
    const fixture = await createFixture();
    const first = await prepareSwaggerUIAssets(fixture);
    const firstBundleStat = await stat(first.bundleDestination);
    const firstLicenseStat = await stat(first.licenseDestination);
    const firstNoticeStat = await stat(first.noticeDestination);

    expect(first.bundleWritten).toBe(true);
    expect(first.licenseWritten).toBe(true);
    expect(first.noticeWritten).toBe(true);
    expect(await readFile(first.bundleDestination, "utf8")).toContain(
      "window.SwaggerUIBundle",
    );
    expect(await readFile(first.licenseDestination, "utf8")).toBe(
      "Synthetic Apache license",
    );
    expect(await readFile(first.noticeDestination, "utf8")).toBe(
      "Synthetic attribution",
    );

    const second = await prepareSwaggerUIAssets(fixture);
    expect(second.bundleWritten).toBe(false);
    expect(second.licenseWritten).toBe(false);
    expect(second.noticeWritten).toBe(false);
    expect((await stat(second.bundleDestination)).mtimeMs).toBe(
      firstBundleStat.mtimeMs,
    );
    expect((await stat(second.licenseDestination)).mtimeMs).toBe(
      firstLicenseStat.mtimeMs,
    );
    expect((await stat(second.noticeDestination)).mtimeMs).toBe(
      firstNoticeStat.mtimeMs,
    );
  });

  it("fails closed when the package license is missing", async () => {
    const fixture = await createFixture({ includeLicense: false });

    await expect(prepareSwaggerUIAssets(fixture)).rejects.toThrow(
      "Missing required swagger-ui-react LICENSE",
    );
  });

  it("fails closed when the package notice is missing", async () => {
    const fixture = await createFixture({ includeNotice: false });

    await expect(prepareSwaggerUIAssets(fixture)).rejects.toThrow(
      "Missing required swagger-ui-react NOTICE",
    );
  });
});
