"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const { readFileSync, realpathSync, statSync } = require("node:fs");
const { resolve } = require("node:path");

const EXPECTED_FILES = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "docker-compose.test.yml",
  "scripts/test-env.mjs",
  "scripts/test-db.mjs",
  "scripts/ci-profile.mjs",
  "scripts/repository-root.cjs",
];

function failRepositoryIdentity() {
  throw new Error("Repository identity validation failed.");
}

let repositoryRoot;
try {
  repositoryRoot = realpathSync(resolve(__dirname, ".."));
  const packagePath = resolve(repositoryRoot, "package.json");
  if (!statSync(packagePath).isFile()) {
    failRepositoryIdentity();
  }

  const packageManifest = JSON.parse(readFileSync(packagePath, "utf8"));
  if (
    packageManifest.name !== "inspoter" ||
    packageManifest.packageManager !== "pnpm@11.12.0"
  ) {
    failRepositoryIdentity();
  }

  for (const relativePath of EXPECTED_FILES) {
    if (!statSync(resolve(repositoryRoot, relativePath)).isFile()) {
      failRepositoryIdentity();
    }
  }
} catch {
  failRepositoryIdentity();
}

module.exports = repositoryRoot;
