import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";

// English is the product's base language: every operator-visible string is
// authored in src/messages/en and every other locale is a translation of it.
// Nothing enforced that before — settings.json and validation.json had silently
// drifted three keys apart, so a Russian-only key resolved to its bare key path
// on the default locale. This guard fails the build on the next drift instead.

const MESSAGES_DIR = path.join(process.cwd(), "src", "messages");
const BASE_LOCALE = routing.defaultLocale;
const TRANSLATED_LOCALES = routing.locales.filter((l) => l !== BASE_LOCALE);

function readCatalog(locale: string, file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, locale, file), "utf-8"),
  ) as Record<string, unknown>;
}

// Flattened dotted key paths, so a namespace that exists on one side but is
// empty on the other is reported as the missing leaves rather than as a match.
function flatten(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child !== null && typeof child === "object" && !Array.isArray(child)
      ? flatten(child as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const baseFiles = readdirSync(path.join(MESSAGES_DIR, BASE_LOCALE)).sort();

describe("message catalogs", () => {
  it("ships at least one namespace per locale", () => {
    expect(baseFiles.length).toBeGreaterThan(0);
  });

  for (const locale of TRANSLATED_LOCALES) {
    describe(`${locale} vs ${BASE_LOCALE}`, () => {
      it("covers the same namespace files", () => {
        expect(readdirSync(path.join(MESSAGES_DIR, locale)).sort()).toEqual(
          baseFiles,
        );
      });

      for (const file of baseFiles) {
        it(`${file} has the same keys`, () => {
          const baseKeys = flatten(readCatalog(BASE_LOCALE, file)).sort();
          const localeKeys = flatten(readCatalog(locale, file)).sort();
          expect(localeKeys).toEqual(baseKeys);
        });
      }
    });
  }
});
