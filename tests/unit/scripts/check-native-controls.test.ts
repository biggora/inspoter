import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  scanSourceFile,
  scanSourceText,
} from "../../../scripts/check-native-controls.mjs";

const FORBIDDEN_TAGS = [
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "label",
  "a",
] as const;

describe("native control guard", () => {
  it("allows standardized components, structural forms, and string HTML", () => {
    const source = `
      export function Form() {
        const generated = "<button>string content</button>";
        return <form><Button>Save</Button><Input /></form>;
      }
    `;

    expect(scanSourceFile(source, "src/components/form.tsx")).toEqual([]);
  });

  it("reports every forbidden intrinsic in opening and self-closing form", () => {
    const source = [
      "export const Controls = () => <>",
      ...FORBIDDEN_TAGS.flatMap((tag) => [
        `  <${tag}></${tag}>`,
        `  <${tag} />`,
      ]),
      "</>;",
    ].join("\n");

    const diagnostics = scanSourceText(source, "src/components/controls.tsx");

    expect(diagnostics).toHaveLength(FORBIDDEN_TAGS.length * 2);
    for (const tag of FORBIDDEN_TAGS) {
      expect(
        diagnostics.filter((diagnostic) =>
          diagnostic.message.startsWith(`raw <${tag}>`),
        ),
      ).toHaveLength(2);
    }
  });

  it("excludes exact UI and generated directories for relative paths", () => {
    const source = `export const Primitive = () => <button>Save</button>`;

    expect(scanSourceFile(source, "src\\components\\ui\\button.tsx")).toEqual(
      [],
    );
    expect(scanSourceFile(source, "src/generated/example.tsx")).toEqual([]);
  });

  it("excludes exact UI and generated directories for absolute Windows paths", () => {
    const source = `export const Primitive = () => <button>Save</button>`;
    const projectRoot = "C:\\repo";

    expect(
      scanSourceFile(
        source,
        "C:\\repo\\src\\components\\ui\\button.tsx",
        projectRoot,
      ),
    ).toEqual([]);
    expect(
      scanSourceFile(
        source,
        "C:\\repo\\src\\generated\\example.tsx",
        projectRoot,
      ),
    ).toEqual([]);
  });

  it("does not exclude near-prefix directories", () => {
    const source = `export const Example = () => <button>Save</button>`;

    expect(
      scanSourceFile(source, "src/components/ui-kit/button.tsx"),
    ).toHaveLength(1);
    expect(
      scanSourceFile(source, "src/generated-client/example.tsx"),
    ).toHaveLength(1);
  });

  it("reports role-only button emulation", () => {
    const diagnostics = scanSourceText(
      `export const Example = () => <><div role="button" /><span role={"button"} /></>;`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.every(({ message }) => message.includes("interactive")),
    ).toBe(true);
  });

  it.each([
    ["div", "onClick"],
    ["span", "onKeyDown"],
    ["li", "onKeyUp"],
    ["div", "onPointerDown"],
  ])("reports tabIndex plus %s activation via %s", (tag, handler) => {
    const diagnostics = scanSourceText(
      `export const Example = () => <${tag} tabIndex={0} ${handler}={() => undefined} />;`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain(`interactive <${tag}>`);
  });

  it("reports tabIndex plus onKeyPress activation", () => {
    const diagnostics = scanSourceText(
      `export const Example = () => <li tabIndex={0} onKeyPress={() => undefined} />;`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("interactive <li>");
  });

  it("recognizes exact static template roles without evaluating dynamic templates", () => {
    const diagnostics = scanSourceText(
      "export const Example = (suffix) => <><div role={`button`} /><span role={(`button`)} /><li role={`dialog`} /><div role={`but${suffix}`} /></>;",
      "src/components/example.tsx",
    );

    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.every(({ message }) => message.includes("interactive")),
    ).toBe(true);
  });

  it("conservatively reports role or tabIndex combined with spreads", () => {
    const diagnostics = scanSourceText(
      `export const Example = (props) => <><div role="button" {...props} /><span tabIndex={0} {...props} /></>;`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.every(({ message }) =>
        message.includes("activation handlers cannot be proven absent"),
      ),
    ).toBe(true);
  });

  it("does not infer interaction from tabIndex or direct handlers alone", () => {
    const diagnostics = scanSourceText(
      `export const Example = () => <><div tabIndex={0} /><span onClick={() => undefined} /></>;`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toEqual([]);
  });

  it("does not misclassify member or namespaced JSX", () => {
    const diagnostics = scanSourceText(
      `export const Example = () => <><UI.button /><Controls.input /><svg:a /></>;`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toEqual([]);
  });

  it("reports the exact one-based source line", () => {
    const diagnostics = scanSourceText(
      `export const Example = () => (\n  <>\n    <button>Save</button>\n  </>\n);`,
      "src/components/example.tsx",
    );

    expect(diagnostics).toEqual([
      {
        filePath: "src/components/example.tsx",
        line: 3,
        message: "raw <button> is forbidden; use the standardized UI component",
      },
    ]);
  });

  it("returns success and failure exit codes from the CLI", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "ui-control-guard-"));
    const componentDirectory = path.join(projectRoot, "src", "components");
    const fixturePath = path.join(componentDirectory, "fixture.tsx");
    const scriptPath = path.resolve(
      process.cwd(),
      "scripts/check-native-controls.mjs",
    );

    try {
      await mkdir(componentDirectory, { recursive: true });
      await writeFile(
        fixturePath,
        `export const Allowed = () => <form><Button /></form>;`,
      );

      const success = spawnSync(process.execPath, [scriptPath], {
        cwd: projectRoot,
        encoding: "utf8",
      });
      expect(success.status).toBe(0);
      expect(success.stdout).toContain("0 forbidden controls");

      await writeFile(
        fixturePath,
        `export const Forbidden = () => <button>Save</button>;`,
      );

      const failure = spawnSync(process.execPath, [scriptPath], {
        cwd: projectRoot,
        encoding: "utf8",
      });
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain(
        "src/components/fixture.tsx:1 raw <button> is forbidden",
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
