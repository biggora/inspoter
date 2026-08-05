import { describe, expect, it } from "vitest";

import {
  ALLOWLIST,
  scanSourceText,
  shouldScanPath,
} from "../../../scripts/check-base-language.mjs";

// The strings below are deliberately non-base-language: they are the guard's
// input fixtures, not product copy. This file is exempt from the guard because
// the guard only scans src/.
const CYRILLIC_FIXTURE = "Проверочная";

describe("base language guard", () => {
  it("flags non-base-language text with its line number", () => {
    const source = [
      "const ok = 'Service is available again';",
      `const bad = '${CYRILLIC_FIXTURE}';`,
    ].join("\n");

    expect(scanSourceText(source, "src/lib/services/services.ts")).toEqual([
      {
        filePath: "src/lib/services/services.ts",
        line: 2,
        text: `const bad = '${CYRILLIC_FIXTURE}';`,
      },
    ]);
  });

  it("passes a file that is entirely base language", () => {
    expect(scanSourceText("export const x = 'Servers';", "src/x.ts")).toEqual(
      [],
    );
  });

  it("truncates a very long line so one minified file cannot flood the output", () => {
    const source = `const bad = "${`${CYRILLIC_FIXTURE} `.repeat(50)}";`;

    const [finding] = scanSourceText(source, "src/x.ts");
    expect(finding.text).toHaveLength(100);
  });
});

describe("shouldScanPath()", () => {
  it("scans ordinary source files", () => {
    expect(shouldScanPath("src/lib/services/alerts.ts", "")).toBe(true);
    expect(shouldScanPath("src/components/alerts/alerts-view.tsx", "")).toBe(
      true,
    );
  });

  // Translations are the whole point of the message catalogs, and the
  // generated Prisma client is not ours to edit.
  it("skips the message catalogs and generated code", () => {
    expect(shouldScanPath("src/messages/ru/alerts.ts", "")).toBe(false);
    expect(shouldScanPath("src/generated/prisma/client.ts", "")).toBe(false);
  });

  it("skips allowlisted files and everything outside src/", () => {
    expect(shouldScanPath("src/lib/mail/imap-smtp.ts", "")).toBe(false);
    expect(shouldScanPath("prisma/seed-demo.ts", "")).toBe(false);
  });
});

describe("ALLOWLIST", () => {
  // An entry without a stated reason is how an allowlist turns into a
  // dumping ground.
  it("gives a reason for every exemption", () => {
    for (const [filePath, reason] of ALLOWLIST) {
      expect(reason, `missing reason for ${filePath}`).toBeTruthy();
    }
  });
});
