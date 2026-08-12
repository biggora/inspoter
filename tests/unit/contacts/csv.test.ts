import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseCsv, writeCsv } from "@/lib/contacts/csv/rfc4180";
import { parseGoogleCsv, serializeGoogleCsv } from "@/lib/contacts/csv/google";
import {
  parseOutlookCsv,
  serializeOutlookCsv,
} from "@/lib/contacts/csv/outlook";
import { createEmptyContactRecord } from "@/lib/contacts/model";

const FIXTURES = path.join(__dirname, "fixtures");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("parseCsv", () => {
  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('a,"line 1\nline 2",c')).toEqual([
      ["a", "line 1\nline 2", "c"],
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', "b"]]);
  });

  it("drops a trailing blank row", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("writeCsv", () => {
  it("quotes only what needs quoting and leads with a BOM", () => {
    const output = writeCsv([["plain", "with,comma", 'with"quote']]);
    expect(output).toBe('﻿plain,"with,comma","with""quote"\r\n');
  });

  it("survives a round-trip", () => {
    const rows = [["Notes"], ["line 1\nline 2"], ['a "quoted" word']];
    expect(parseCsv(writeCsv(rows).slice(1))).toEqual(rows);
  });
});

describe("parseGoogleCsv", () => {
  const contacts = parseGoogleCsv(fixture("google-contacts.csv"));

  it("reads every data row", () => {
    expect(contacts).toHaveLength(2);
  });

  it("maps the scalar columns", () => {
    expect(contacts[0]).toMatchObject({
      firstName: "Anna",
      middleName: "Marie",
      lastName: "Petrova",
      prefix: "Dr.",
      suffix: "PhD",
      nickname: "Annie",
      phoneticFirst: "AH-nuh",
      organization: "Inspot Labs",
      jobTitle: "Site Reliability Engineer",
      department: "Operations",
      birthday: "1985-04-12",
    });
  });

  it("canonicalizes Google's label spellings", () => {
    const phones = contacts[0].fields.filter((field) => field.kind === "PHONE");
    expect(phones.map((field) => field.label)).toEqual(["mobile", "work"]);
  });

  it("keeps a custom label verbatim", () => {
    const url = contacts[0].fields.find((field) => field.kind === "URL");
    expect(url?.label).toBe("Blog");
  });

  it("splits the ':::' multi-value label list", () => {
    expect(contacts[0].labels).toEqual(["Work", "Operations"]);
  });

  it("reads the structured address alongside its formatted rendering", () => {
    expect(contacts[0].addresses[0]).toMatchObject({
      label: "home",
      street: "Brivibas iela 1, dz. 5",
      city: "Riga",
      postalCode: "LV-1010",
      country: "Latvia",
      formatted: "Brivibas iela 1, Riga LV-1010",
    });
  });

  it("keeps a multi-line note", () => {
    expect(contacts[0].notes).toBe(
      "Prefers email over phone.\nOn call every other week.",
    );
  });

  it("leaves the sparse second row with only what it had", () => {
    expect(contacts[1]).toMatchObject({
      firstName: "Carol",
      lastName: "Mendez",
      organization: null,
      labels: ["Family"],
    });
    expect(contacts[1].addresses).toEqual([]);
  });
});

describe("serializeGoogleCsv", () => {
  it("sizes the repeating groups to the busiest contact", () => {
    const contacts = parseGoogleCsv(fixture("google-contacts.csv"));
    const [header] = parseCsv(serializeGoogleCsv(contacts).slice(1));
    expect(header).toContain("E-mail 2 - Value");
    expect(header).not.toContain("E-mail 3 - Value");
  });

  it("round-trips the fixture", () => {
    const original = parseGoogleCsv(fixture("google-contacts.csv"));
    const reparsed = parseGoogleCsv(serializeGoogleCsv(original));
    expect(reparsed).toEqual(original);
  });

  it("writes no group columns for an empty address book", () => {
    const [header] = parseCsv(serializeGoogleCsv([]).slice(1));
    expect(header).toEqual([
      "First Name",
      "Middle Name",
      "Last Name",
      "Phonetic First Name",
      "Phonetic Middle Name",
      "Phonetic Last Name",
      "Name Prefix",
      "Name Suffix",
      "Nickname",
      "File As",
      "Organization Name",
      "Organization Title",
      "Organization Department",
      "Birthday",
      "Notes",
      "Labels",
    ]);
  });
});

describe("parseOutlookCsv", () => {
  const contacts = parseOutlookCsv(fixture("outlook-contacts.csv"));

  it("treats Title as the honorific and Job Title as the position", () => {
    expect(contacts[0]).toMatchObject({
      prefix: "Dr.",
      jobTitle: "Site Reliability Engineer",
      organization: "Inspot Labs",
      department: "Operations",
    });
  });

  it("labels each phone column", () => {
    const phones = contacts[0].fields.filter((field) => field.kind === "PHONE");
    expect(phones).toEqual([
      {
        kind: "PHONE",
        label: "mobile",
        value: "+371 20 000 001",
        isPrimary: false,
      },
      {
        kind: "PHONE",
        label: "home",
        value: "+371 67 111 000",
        isPrimary: false,
      },
      {
        kind: "PHONE",
        label: "work",
        value: "+371 67 000 002",
        isPrimary: false,
      },
      {
        kind: "PHONE",
        label: "workFax",
        value: "+371 67 000 003",
        isPrimary: false,
      },
    ]);
  });

  it("splits the home and business addresses apart", () => {
    expect(contacts[0].addresses.map((address) => address.label)).toEqual([
      "home",
      "work",
    ]);
  });

  it("reads semicolon-separated categories", () => {
    expect(contacts[0].labels).toEqual(["Work", "Operations"]);
  });

  it("reads the anniversary and spouse into fields", () => {
    expect(contacts[0].fields).toContainEqual({
      kind: "EVENT",
      label: "anniversary",
      value: "2010-06-01",
      isPrimary: false,
    });
    expect(contacts[0].fields).toContainEqual({
      kind: "RELATION",
      label: "spouse",
      value: "Boris Petrov",
      isPrimary: false,
    });
  });
});

describe("serializeOutlookCsv", () => {
  it("always writes the full Outlook column set", () => {
    const [header] = parseCsv(serializeOutlookCsv([]).slice(1));
    expect(header).toContain("E-mail Address");
    expect(header).toContain("Business Phone 2");
    expect(header).toHaveLength(44);
  });

  it("places a second work phone in the 'Business Phone 2' column", () => {
    const record = createEmptyContactRecord();
    record.firstName = "Anna";
    record.fields = [
      { kind: "PHONE", label: "work", value: "111", isPrimary: false },
      { kind: "PHONE", label: "work", value: "222", isPrimary: false },
    ];
    const [header, row] = parseCsv(serializeOutlookCsv([record]).slice(1));
    expect(row[header.indexOf("Business Phone")]).toBe("111");
    expect(row[header.indexOf("Business Phone 2")]).toBe("222");
  });
});
