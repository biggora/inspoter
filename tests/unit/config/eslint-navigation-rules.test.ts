import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Workspace-in-URL (docs/plans/workspace-in-url.md §4.4, Slices 2 and 3):
// navigation must go through `@/i18n/navigation`, which adds the locale and
// `/w/<slug>` prefixes. `eslint.config.mjs` enforces that; these cases lint
// in-memory fixtures with the real config, so a rule that stops matching fails
// here instead of silently letting un-prefixed navigation back in.

const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

const COMPONENT = "src/components/shell/lint-fixture.tsx";

// The first lintText loads the flat config and the TypeScript parser, which
// outlasts the 5s default when the machine is busy.
describe("navigation import restrictions", { timeout: 30_000 }, () => {
  it.each([
    ["useRouter", 'import { useRouter } from "next/navigation";'],
    ["usePathname", 'import { usePathname } from "next/navigation";'],
    ["redirect", 'import { redirect } from "next/navigation";'],
    [
      "permanentRedirect",
      'import { permanentRedirect } from "next/navigation";',
    ],
  ])(
    "rejects %s from next/navigation in src/components",
    async (name, line) => {
      const messages = await restrictedImportMessages(
        `${line}\nexport const x = ${name};\n`,
        COMPONENT,
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(name);
      expect(messages[0]).toContain("@/i18n/navigation");
    },
  );

  it("rejects the same imports in src/app", async () => {
    const messages = await restrictedImportMessages(
      'import { useRouter } from "next/navigation";\nexport const x = useRouter;\n',
      "src/app/[locale]/(dashboard)/w/[workspace]/lint-fixture.tsx",
    );

    expect(messages).toHaveLength(1);
  });

  it("rejects a default next/link import in src/components", async () => {
    const messages = await restrictedImportMessages(
      'import Link from "next/link";\nexport const x = Link;\n',
      COMPONENT,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("@/i18n/navigation");
  });

  it("rejects the raw navigation-base module outside src/i18n", async () => {
    const messages = await restrictedImportMessages(
      'import { Link } from "@/i18n/navigation-base";\nexport const x = Link;\n',
      COMPONENT,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("navigation-base");
  });

  it("still allows notFound, useParams and useSearchParams from next/navigation", async () => {
    const messages = await restrictedImportMessages(
      'import { notFound, useParams, useSearchParams } from "next/navigation";\nexport const x = [notFound, useParams, useSearchParams];\n',
      COMPONENT,
    );

    expect(messages).toEqual([]);
  });

  it("allows the wrapper import and next/navigation inside src/i18n", async () => {
    expect(
      await restrictedImportMessages(
        'import { useRouter } from "@/i18n/navigation";\nexport const x = useRouter;\n',
        COMPONENT,
      ),
    ).toEqual([]);
    expect(
      await restrictedImportMessages(
        'import { useRouter } from "next/navigation";\nexport const x = useRouter;\n',
        "src/i18n/lint-fixture.ts",
      ),
    ).toEqual([]);
  });
});
