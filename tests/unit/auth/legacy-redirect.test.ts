import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The pure parts of the legacy redirect (docs/plans/workspace-in-url.md §4.5):
// rebuilding the workspace-relative path from route params and the query, and
// the route layout that keeps non-section URLs a plain 404 (plan K-1).

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/dal", () => ({
  findMemberWorkspaceBySlug: vi.fn(),
  resolveLastUsedWorkspace: vi.fn(),
}));

import { legacyWorkspacePath } from "@/lib/auth/legacy-redirect";
import { toWorkspacePath, WORKSPACE_SECTIONS } from "@/lib/workspace-path";

describe("legacyWorkspacePath", () => {
  it("rebuilds path and query: /notes/abc?x=1", () => {
    expect(legacyWorkspacePath(["notes", "abc"], { x: "1" })).toBe(
      "/notes/abc?x=1",
    );
    expect(
      toWorkspacePath(
        "acme",
        legacyWorkspacePath(["notes", "abc"], { x: "1" }),
      ),
    ).toBe("/w/acme/notes/abc?x=1");
  });

  it("emits no '?' for an empty query and keeps a bare section", () => {
    expect(legacyWorkspacePath(["kanban"], {})).toBe("/kanban");
  });

  it("keeps repeated query keys in order and skips undefined values", () => {
    expect(
      legacyWorkspacePath(["mail"], {
        label: ["a", "b"],
        q: "x y",
        z: undefined,
      }),
    ).toBe("/mail?label=a&label=b&q=x+y");
  });

  it("does not encode the already-encoded route params a second time", () => {
    expect(legacyWorkspacePath(["notes", "caf%C3%A9%20x"], {})).toBe(
      "/notes/caf%C3%A9%20x",
    );
  });
});

describe("(legacy) route folders", () => {
  const legacyDir = path.join(process.cwd(), "src/app/[locale]/(legacy)");
  const folders = readdirSync(legacyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it("has exactly one route per workspace section, so any other URL matches no route and keeps the global 404", () => {
    expect([...folders].sort()).toEqual([...WORKSPACE_SECTIONS].sort());
  });

  it.each(WORKSPACE_SECTIONS)("%s serves its own section", (section) => {
    const page = readFileSync(
      path.join(legacyDir, section, "[[...rest]]", "page.tsx"),
      "utf8",
    );
    expect(page).toContain(`legacySectionPage("${section}")`);
  });
});
