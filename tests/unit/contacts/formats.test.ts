import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectContactFormat,
  parseContactsFile,
  serializeContacts,
  UnknownContactFormatError,
} from "@/lib/contacts/formats";
import { createEmptyContactRecord } from "@/lib/contacts/model";
import { decodeText, encodeQuotedPrintable } from "@/lib/contacts/text";

const FIXTURES = path.join(__dirname, "fixtures");

function bytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

function text(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("detectContactFormat", () => {
  it.each([
    ["google-export.vcf", "vcard"],
    ["nokia-2.1.vcf", "vcard"],
    ["google-contacts.csv", "google-csv"],
    ["outlook-contacts.csv", "outlook-csv"],
    ["thunderbird.ldif", "ldif"],
  ])("recognizes %s", (name, expected) => {
    expect(detectContactFormat(text(name))).toBe(expected);
  });

  it("returns null rather than guessing at an unrelated file", () => {
    expect(detectContactFormat("id,total\n1,42\n")).toBeNull();
  });
});

describe("parseContactsFile", () => {
  it("sniffs the format and parses in one step", () => {
    const result = parseContactsFile(bytes("google-contacts.csv"));
    expect(result.format).toBe("google-csv");
    expect(result.contacts).toHaveLength(2);
  });

  it("honours an explicit format override", () => {
    const result = parseContactsFile(bytes("google-export.vcf"), "vcard");
    expect(result.format).toBe("vcard");
  });

  it("rejects a file it cannot identify", () => {
    expect(() => parseContactsFile(new TextEncoder().encode("hello"))).toThrow(
      UnknownContactFormatError,
    );
  });

  it("reads a UTF-8 file that carries a BOM", () => {
    const withBom = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode(text("google-contacts.csv")),
    ]);
    expect(parseContactsFile(withBom).contacts).toHaveLength(2);
  });
});

describe("decodeText", () => {
  it("strips a UTF-8 BOM", () => {
    const encoded = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]);
    expect(decodeText(encoded)).toBe("a");
  });

  it("falls back to windows-1251 for bytes that are not valid UTF-8", () => {
    // "Привет" in windows-1251.
    const encoded = Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
    expect(decodeText(encoded)).toBe("Привет");
  });

  it("round-trips quoted-printable", () => {
    const encoded = encodeQuotedPrintable("Борис");
    expect(decodeText(new TextEncoder().encode("x")).length).toBe(1);
    expect(encoded).toMatch(/^=D0=91/u);
  });
});

describe("serializeContacts", () => {
  const record = createEmptyContactRecord();
  record.firstName = "Anna";
  record.lastName = "Petrova";
  record.fields = [
    {
      kind: "EMAIL",
      label: "work",
      value: "anna@example.com",
      isPrimary: true,
    },
  ];

  it.each([
    ["vcard-3.0", "vcf", "text/vcard; charset=utf-8"],
    ["vcard-4.0", "vcf", "text/vcard; charset=utf-8"],
    ["google-csv", "csv", "text/csv; charset=utf-8"],
    ["outlook-csv", "csv", "text/csv; charset=utf-8"],
    ["ldif", "ldif", "text/plain; charset=utf-8"],
  ] as const)("describes %s output", (format, extension, contentType) => {
    const file = serializeContacts([record], format);
    expect(file.fileExtension).toBe(extension);
    expect(file.contentType).toBe(contentType);
    expect(file.content).toContain("anna@example.com");
  });

  it("produces output every importer recognizes again", () => {
    for (const format of [
      "vcard-3.0",
      "vcard-4.0",
      "google-csv",
      "outlook-csv",
      "ldif",
    ] as const) {
      const { content } = serializeContacts([record], format);
      const reparsed = parseContactsFile(new TextEncoder().encode(content));
      expect(reparsed.contacts).toHaveLength(1);
      expect(reparsed.contacts[0].firstName).toBe("Anna");
    }
  });
});
