import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORKSPACE_SECTIONS } from "@/lib/workspace-path";

// Folder that holds one directory per workspace section. When the section
// folders move under `w/[workspace]`, only this constant changes.
const SECTIONS_ROOT = path.join(
  process.cwd(),
  "src",
  "app",
  "[locale]",
  "(dashboard)",
);

describe("WORKSPACE_SECTIONS", () => {
  it("equals the section folders on disk", () => {
    const onDisk = readdirSync(SECTIONS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(onDisk).toHaveLength(19);
    expect([...WORKSPACE_SECTIONS].sort()).toEqual(onDisk);
  });

  it("has no duplicates", () => {
    expect(new Set(WORKSPACE_SECTIONS).size).toBe(WORKSPACE_SECTIONS.length);
  });
});
