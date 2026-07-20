import { createRequire } from "node:module";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_VERSION = "5.32.9";
const BUNDLE_NAME = "swagger-ui-bundle.js";
const LICENSE_SOURCE_NAME = "LICENSE";
const LICENSE_DESTINATION_NAME = "swagger-ui-bundle.js.LICENSE.txt";
const NOTICE_NAME = "NOTICE";
const UMD_MARKERS = ["webpackUniversalModuleDefinition", "SwaggerUIBundle"];

const require = createRequire(import.meta.url);
const defaultProjectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function findPackageDirectory(entryPath) {
  let candidate = dirname(entryPath);

  while (candidate !== dirname(candidate)) {
    try {
      require.resolve(join(candidate, "package.json"));
      return candidate;
    } catch {
      candidate = dirname(candidate);
    }
  }

  throw new Error("Could not locate the installed swagger-ui-react package.");
}

async function readRequiredFile(path, description) {
  try {
    return await readFile(path);
  } catch (error) {
    throw new Error(
      `Missing required swagger-ui-react ${description}: ${path}`,
      {
        cause: error,
      },
    );
  }
}

async function writeIfChanged(destinationPath, sourceBytes) {
  try {
    const destinationBytes = await readFile(destinationPath);
    if (sourceBytes.equals(destinationBytes)) return false;
  } catch (error) {
    if (!(error instanceof Error) || !Reflect.has(error, "code")) throw error;
    if (Reflect.get(error, "code") !== "ENOENT") throw error;
  }

  const temporaryPath = `${destinationPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, sourceBytes, { flag: "wx" });

  try {
    await rename(temporaryPath, destinationPath);
  } catch (error) {
    if (
      error instanceof Error &&
      Reflect.has(error, "code") &&
      ["EEXIST", "EPERM"].includes(String(Reflect.get(error, "code")))
    ) {
      await rm(destinationPath, { force: true });
      await rename(temporaryPath, destinationPath);
    } else {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  return true;
}

export async function prepareSwaggerUIAssets({
  packageDirectory,
  projectRoot,
}) {
  const packageJsonPath = join(packageDirectory, "package.json");
  const packageJsonBytes = await readRequiredFile(
    packageJsonPath,
    "package.json",
  );
  const packageJson = JSON.parse(packageJsonBytes.toString("utf8"));

  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error(
      `Expected swagger-ui-react ${EXPECTED_VERSION}, received ${String(packageJson.version)}.`,
    );
  }

  const bundleBytes = await readRequiredFile(
    join(packageDirectory, BUNDLE_NAME),
    BUNDLE_NAME,
  );
  const bundleText = bundleBytes.toString("utf8");
  for (const marker of UMD_MARKERS) {
    if (!bundleText.includes(marker)) {
      throw new Error(
        `The pinned ${BUNDLE_NAME} is missing the expected UMD marker: ${marker}.`,
      );
    }
  }

  const licenseBytes = await readRequiredFile(
    join(packageDirectory, LICENSE_SOURCE_NAME),
    LICENSE_SOURCE_NAME,
  );
  const noticeBytes = await readRequiredFile(
    join(packageDirectory, NOTICE_NAME),
    NOTICE_NAME,
  );
  const destinationDirectory = join(
    projectRoot,
    "public",
    "vendor",
    "swagger-ui",
    EXPECTED_VERSION,
  );
  await mkdir(destinationDirectory, { recursive: true });

  const bundleDestination = join(destinationDirectory, BUNDLE_NAME);
  const licenseDestination = join(
    destinationDirectory,
    LICENSE_DESTINATION_NAME,
  );
  const noticeDestination = join(destinationDirectory, NOTICE_NAME);
  const bundleWritten = await writeIfChanged(bundleDestination, bundleBytes);
  const licenseWritten = await writeIfChanged(licenseDestination, licenseBytes);
  const noticeWritten = await writeIfChanged(noticeDestination, noticeBytes);

  return {
    bundleDestination,
    bundleWritten,
    licenseDestination,
    licenseWritten,
    noticeDestination,
    noticeWritten,
  };
}

async function main() {
  const packageEntry = require.resolve("swagger-ui-react");
  const packageDirectory = findPackageDirectory(packageEntry);
  const result = await prepareSwaggerUIAssets({
    packageDirectory,
    projectRoot: defaultProjectRoot,
  });
  const status =
    result.bundleWritten || result.licenseWritten || result.noticeWritten
      ? "Prepared"
      : "Current";
  console.log(
    `${status} Swagger UI ${EXPECTED_VERSION} assets: ${dirname(result.bundleDestination)}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
