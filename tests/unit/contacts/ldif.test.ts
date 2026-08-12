import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseLdif, serializeLdif } from "@/lib/contacts/ldif";
import { createEmptyContactRecord } from "@/lib/contacts/model";

const FIXTURES = path.join(__dirname, "fixtures");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf-8");
}

describe("parseLdif", () => {
  const contacts = parseLdif(fixture("thunderbird.ldif"));

  it("splits entries on the blank line", () => {
    expect(contacts).toHaveLength(2);
  });

  it("maps the Mozilla attributes", () => {
    expect(contacts[0]).toMatchObject({
      firstName: "Anna",
      lastName: "Petrova",
      nickname: "Annie",
      organization: "Inspot Labs",
      department: "Operations",
      jobTitle: "Site Reliability Engineer",
      notes: "Prefers email over phone.",
    });
  });

  it("assembles the three birthday attributes", () => {
    expect(contacts[0].birthday).toBe("1985-04-12");
  });

  it("labels each phone attribute", () => {
    const phones = contacts[0].fields.filter((field) => field.kind === "PHONE");
    expect(phones.map((field) => [field.label, field.value])).toEqual([
      ["mobile", "+371 20 000 001"],
      ["home", "+371 67 111 000"],
      ["work", "+371 67 000 002"],
    ]);
  });

  it("reads mail and mozillaSecondEmail as two addresses", () => {
    expect(
      contacts[0].fields
        .filter((field) => field.kind === "EMAIL")
        .map((field) => field.value),
    ).toEqual(["anna@example.com", "anna.petrova@inspot.example"]);
  });

  it("decodes base64 attribute values", () => {
    expect(contacts[1]).toMatchObject({
      firstName: "Борис",
      lastName: "Петров",
    });
  });
});

describe("serializeLdif", () => {
  it("base64-encodes a value that is not safe ASCII", () => {
    const record = createEmptyContactRecord();
    record.firstName = "Борис";
    record.lastName = "Петров";
    const output = serializeLdif([record]);
    expect(output).toContain("givenName:: ");
    expect(output).not.toContain("givenName: Борис");
  });

  it("round-trips the fixture's names, phones and organization", () => {
    const original = parseLdif(fixture("thunderbird.ldif"));
    const reparsed = parseLdif(serializeLdif(original));
    expect(reparsed).toHaveLength(2);
    expect(reparsed[0]).toMatchObject({
      firstName: "Anna",
      lastName: "Petrova",
      organization: "Inspot Labs",
      birthday: "1985-04-12",
      notes: "Prefers email over phone.",
    });
    expect(reparsed[0].fields).toEqual(original[0].fields);
    expect(reparsed[1].firstName).toBe("Борис");
  });

  it("writes a year-less birthday without a birthyear line", () => {
    const record = createEmptyContactRecord();
    record.firstName = "Anna";
    record.birthday = "--04-12";
    const output = serializeLdif([record]);
    expect(output).not.toContain("birthyear");
    expect(output).toContain("birthmonth: 4");
    expect(output).toContain("birthday: 12");
  });
});
