import { describe, expect, it } from "vitest";

import { mergeContactRecords, mergeFields } from "@/lib/contacts/merge";
import { createEmptyContactRecord } from "@/lib/contacts/model";
import {
  buildDisplayName,
  buildSearchText,
  buildSortKey,
  duplicateKeys,
  normalizeEmail,
  normalizePhone,
  phoneDuplicateKey,
} from "@/lib/contacts/normalize";

describe("normalizeEmail", () => {
  it.each([
    ["Anna@Example.COM", "anna@example.com"],
    ["  anna@example.com ", "anna@example.com"],
    ["Anna Petrova <anna@example.com>", "anna@example.com"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it("rejects a value that is not an address", () => {
    expect(normalizeEmail("not an email")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("keeps the leading plus and drops formatting", () => {
    expect(normalizePhone("+371 (20) 000-001")).toBe("+37120000001");
  });

  it("rejects something too short to be a number", () => {
    expect(normalizePhone("12")).toBeNull();
  });

  it("matches the same number written two ways", () => {
    expect(phoneDuplicateKey("+371 20 000 001")).toBe(
      phoneDuplicateKey("20000001"),
    );
  });

  it("keeps two different numbers apart", () => {
    expect(phoneDuplicateKey("+371 20 000 001")).not.toBe(
      phoneDuplicateKey("+371 20 000 002"),
    );
  });
});

describe("buildDisplayName", () => {
  it("joins the structured name", () => {
    const record = createEmptyContactRecord();
    record.prefix = "Dr.";
    record.firstName = "Anna";
    record.lastName = "Petrova";
    record.suffix = "PhD";
    expect(buildDisplayName(record)).toBe("Dr. Anna Petrova, PhD");
  });

  it("falls back through nickname, organization and then the first email", () => {
    const record = createEmptyContactRecord();
    record.organization = "Inspot Labs";
    expect(buildDisplayName(record)).toBe("Inspot Labs");

    const onlyEmail = createEmptyContactRecord();
    onlyEmail.fields = [
      { kind: "EMAIL", label: null, value: "a@b.c", isPrimary: false },
    ];
    expect(buildDisplayName(onlyEmail)).toBe("a@b.c");
  });

  it("returns an empty string when the record says nothing", () => {
    expect(buildDisplayName(createEmptyContactRecord())).toBe("");
  });
});

describe("buildSortKey", () => {
  it("folds case so two spellings sort together", () => {
    expect(buildSortKey("ANNA")).toBe(buildSortKey("anna"));
  });
});

describe("buildSearchText", () => {
  const record = createEmptyContactRecord();
  record.firstName = "Anna";
  record.lastName = "Petrova";
  record.organization = "Inspot Labs";
  record.labels = ["Work"];
  record.fields = [
    {
      kind: "PHONE",
      label: "mobile",
      value: "+371 20 000 001",
      isPrimary: false,
    },
  ];
  const searchText = buildSearchText(record);

  it("covers the name, organization and labels", () => {
    expect(searchText).toContain("anna");
    expect(searchText).toContain("petrova");
    expect(searchText).toContain("inspot");
    expect(searchText).toContain("work");
  });

  it("includes the normalized phone so digits-only search finds it", () => {
    expect(searchText).toContain("+37120000001");
  });
});

describe("duplicateKeys", () => {
  it("keys on email, phone and name", () => {
    expect(
      duplicateKeys({
        displayName: "Anna Petrova",
        fields: [
          { kind: "EMAIL", value: "Anna@Example.com" },
          { kind: "PHONE", value: "+371 20 000 001" },
        ],
      }),
    ).toEqual([
      "email:anna@example.com",
      "phone:20000001",
      "name:anna petrova",
    ]);
  });
});

describe("mergeFields", () => {
  it("collapses the same email written two ways", () => {
    const merged = mergeFields([
      [
        {
          kind: "EMAIL",
          label: "home",
          value: "Anna@Example.com",
          isPrimary: false,
        },
      ],
      [
        {
          kind: "EMAIL",
          label: null,
          value: "anna@example.com",
          isPrimary: false,
        },
      ],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe("Anna@Example.com");
  });

  it("fills in a label the first copy lacked", () => {
    const merged = mergeFields([
      [
        {
          kind: "PHONE",
          label: null,
          value: "+371 20 000 001",
          isPrimary: false,
        },
      ],
      [
        {
          kind: "PHONE",
          label: "mobile",
          value: "+371 20 000 001",
          isPrimary: false,
        },
      ],
    ]);
    expect(merged[0].label).toBe("mobile");
  });

  it("leaves at most one primary per kind", () => {
    const merged = mergeFields([
      [{ kind: "EMAIL", label: null, value: "a@b.c", isPrimary: true }],
      [{ kind: "EMAIL", label: null, value: "d@e.f", isPrimary: true }],
    ]);
    expect(merged.filter((field) => field.isPrimary)).toHaveLength(1);
  });
});

describe("mergeContactRecords", () => {
  it("lets the leading record's scalars win and fills its gaps from the rest", () => {
    const primary = createEmptyContactRecord();
    primary.firstName = "Anna";
    primary.notes = "Prefers email.";

    const other = createEmptyContactRecord();
    other.firstName = "Anastasia";
    other.lastName = "Petrova";
    other.organization = "Inspot Labs";
    other.notes = "On call this week.";
    other.starred = true;

    const merged = mergeContactRecords([primary, other]);
    expect(merged.firstName).toBe("Anna");
    expect(merged.lastName).toBe("Petrova");
    expect(merged.organization).toBe("Inspot Labs");
    expect(merged.starred).toBe(true);
  });

  it("keeps both notes rather than choosing one", () => {
    const primary = createEmptyContactRecord();
    primary.notes = "Prefers email.";
    const other = createEmptyContactRecord();
    other.notes = "On call this week.";
    expect(mergeContactRecords([primary, other]).notes).toBe(
      "Prefers email.\n\nOn call this week.",
    );
  });

  it("takes the first available photo", () => {
    const primary = createEmptyContactRecord();
    const other = createEmptyContactRecord();
    other.photo = { contentType: "image/png", data: Uint8Array.from([1]) };
    expect(mergeContactRecords([primary, other]).photo?.contentType).toBe(
      "image/png",
    );
  });

  it("refuses an empty input", () => {
    expect(() => mergeContactRecords([])).toThrow();
  });
});
