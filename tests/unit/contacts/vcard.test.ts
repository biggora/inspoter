import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseVCard, normalizeDate } from "@/lib/contacts/vcard/parse";
import {
  serializeVCard,
  serializeVCards,
} from "@/lib/contacts/vcard/serialize";
import { createEmptyContactRecord } from "@/lib/contacts/model";
import { foldLine } from "@/lib/contacts/text";

const FIXTURES = path.join(__dirname, "fixtures");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("parseVCard — vCard 3.0", () => {
  const contacts = parseVCard(fixture("google-export.vcf"));

  it("reads every card in the file", () => {
    expect(contacts).toHaveLength(2);
  });

  it("splits the structured name", () => {
    const [anna] = contacts;
    expect(anna.firstName).toBe("Anna");
    expect(anna.middleName).toBe("Marie");
    expect(anna.lastName).toBe("Petrova");
    expect(anna.prefix).toBe("Dr.");
    expect(anna.suffix).toBe("PhD");
    expect(anna.nickname).toBe("Annie");
  });

  it("maps ORG onto organization and department", () => {
    expect(contacts[0].organization).toBe("Inspot Labs");
    expect(contacts[0].department).toBe("Operations");
    expect(contacts[0].jobTitle).toBe("Site Reliability Engineer");
  });

  it("canonicalizes TEL and EMAIL types into labels", () => {
    const labels = contacts[0].fields
      .filter((field) => field.kind === "PHONE")
      .map((field) => field.label);
    expect(labels).toEqual(["mobile", "work", "workFax"]);

    const emails = contacts[0].fields.filter((field) => field.kind === "EMAIL");
    expect(emails.map((field) => field.label)).toEqual(["home", "work"]);
    // TYPE=PREF marks the primary address without becoming a visible label.
    expect(emails[1].isPrimary).toBe(true);
  });

  it("unescapes commas inside a structured ADR component", () => {
    expect(contacts[0].addresses[0]).toMatchObject({
      label: "home",
      street: "Brivibas iela 1, dz. 5",
      city: "Riga",
      postalCode: "LV-1010",
      country: "Latvia",
    });
  });

  it("resolves an Apple-style grouped label", () => {
    const url = contacts[0].fields.find((field) => field.kind === "URL");
    expect(url).toMatchObject({ value: "https://anna.example", label: "Blog" });
  });

  it("turns \\n escapes back into line breaks", () => {
    expect(contacts[0].notes).toBe(
      "Prefers email over phone.\nOn call every other week.",
    );
  });

  it("reads CATEGORIES as labels", () => {
    expect(contacts[0].labels).toEqual(["Work", "Operations"]);
  });

  it("keeps a card that has only an organization and an email", () => {
    expect(contacts[1]).toMatchObject({
      organization: "Inspot Labs",
      fileAs: "Inspot Support",
    });
  });
});

describe("parseVCard — vCard 2.1", () => {
  const [boris] = parseVCard(fixture("nokia-2.1.vcf"));

  it("decodes quoted-printable across a soft line break", () => {
    expect(boris.lastName).toBe("Петров");
    expect(boris.firstName).toBe("Борис");
    expect(boris.organization).toBe("Инспот");
  });

  it("reads bare 2.1 type parameters", () => {
    const phones = boris.fields.filter((field) => field.kind === "PHONE");
    expect(phones.map((field) => field.label)).toEqual(["mobile", "home"]);
    expect(boris.fields.find((field) => field.kind === "EMAIL")?.label).toBe(
      "home",
    );
  });
});

describe("serializeVCard", () => {
  const record = createEmptyContactRecord();
  record.firstName = "Anna";
  record.lastName = "Petrova";
  record.organization = "Inspot Labs";
  record.birthday = "--04-12";
  record.labels = ["Work"];
  record.fields = [
    {
      kind: "EMAIL",
      label: "work",
      value: "anna@example.com",
      isPrimary: true,
    },
    {
      kind: "PHONE",
      label: "mobile",
      value: "+371 20 000 001",
      isPrimary: false,
    },
  ];

  it("writes CRLF-terminated 3.0 with TYPE=PREF", () => {
    const output = serializeVCard(record, "3.0");
    expect(output).toContain("VERSION:3.0\r\n");
    expect(output).toContain("EMAIL;TYPE=WORK;TYPE=PREF:anna@example.com");
    expect(output).toContain("TEL;TYPE=CELL:+371 20 000 001");
    expect(output.endsWith("END:VCARD\r\n")).toBe(true);
  });

  it("writes 4.0 with PREF=1 and a compact year-less birthday", () => {
    const output = serializeVCard(record, "4.0");
    expect(output).toContain("EMAIL;TYPE=work;PREF=1:anna@example.com");
    expect(output).toContain("BDAY:--0412");
  });

  it("round-trips a record through 3.0 without losing a field", () => {
    const [parsed] = parseVCard(serializeVCard(record, "3.0"));
    expect(parsed.firstName).toBe("Anna");
    expect(parsed.lastName).toBe("Petrova");
    expect(parsed.organization).toBe("Inspot Labs");
    expect(parsed.birthday).toBe("--04-12");
    expect(parsed.labels).toEqual(["Work"]);
    expect(parsed.fields).toEqual(record.fields);
  });

  it("round-trips the whole 3.0 fixture", () => {
    const original = parseVCard(fixture("google-export.vcf"));
    const reparsed = parseVCard(serializeVCards(original, "3.0"));
    expect(reparsed).toEqual(original);
  });

  it("round-trips a photo through base64", () => {
    const withPhoto = createEmptyContactRecord();
    withPhoto.firstName = "Anna";
    withPhoto.photo = {
      contentType: "image/png",
      data: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    };
    const [parsed] = parseVCard(serializeVCard(withPhoto, "3.0"));
    expect(parsed.photo?.contentType).toBe("image/png");
    expect([...(parsed.photo?.data ?? [])]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });
});

describe("foldLine", () => {
  it("never splits a multi-byte character", () => {
    const folded = foldLine(`NOTE:${"я".repeat(60)}`);
    for (const physical of folded.split("\r\n")) {
      expect(Buffer.byteLength(physical, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /gu, "")).toBe(`NOTE:${"я".repeat(60)}`);
  });
});

describe("normalizeDate", () => {
  it.each([
    ["1985-04-12", "1985-04-12"],
    ["19850412", "1985-04-12"],
    ["--0412", "--04-12"],
    ["--04-12", "--04-12"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it("keeps text it cannot parse", () => {
    expect(normalizeDate("spring 1980")).toBe("spring 1980");
  });
});
