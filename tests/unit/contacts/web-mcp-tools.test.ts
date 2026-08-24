import { describe, expect, it, vi } from "vitest";

import {
  createContactsTools,
  type ContactsToolDeps,
} from "@/components/contacts/web-mcp-tools";
import type { ContactPayload } from "@/components/contacts/api";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { ContactDetail, ContactListItem } from "@/lib/services/contacts";
import {
  expectToolError,
  expectToolJson,
  expectToolText,
} from "../web-mcp/test-utils";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function makeListItem(
  overrides: Partial<ContactListItem> = {},
): ContactListItem {
  return {
    id: "contact-1",
    displayName: "Ada Lovelace",
    organization: "Analytical Engines",
    jobTitle: "Mathematician",
    starred: false,
    hasPhoto: false,
    primaryEmail: "ada@example.com",
    primaryPhone: "+44 20 7946 0000",
    labels: [{ id: "label-1", name: "Friends", color: "BLUE" }],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ContactDetail> = {}): ContactDetail {
  return {
    ...makeListItem(),
    prefix: null,
    firstName: "Ada",
    middleName: null,
    lastName: "Lovelace",
    suffix: null,
    phoneticFirst: null,
    phoneticMiddle: null,
    phoneticLast: null,
    nickname: "Countess",
    fileAs: null,
    department: "Research",
    birthday: "1815-12-10",
    notes: "Met at the Royal Society.",
    fields: [
      {
        id: "field-1",
        kind: "EMAIL",
        label: "work",
        value: "ada@example.com",
        isPrimary: true,
      },
      {
        id: "field-2",
        kind: "URL",
        label: null,
        value: "https://ada.example.com",
        isPrimary: false,
      },
    ],
    addresses: [
      {
        id: "address-1",
        label: "home",
        poBox: null,
        extended: null,
        street: "12 St James's Square",
        city: "London",
        region: null,
        postalCode: "SW1Y 4LE",
        country: "UK",
        formatted: null,
      },
    ],
    updatedAt: NOW,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ContactsToolDeps> = {}): ContactsToolDeps {
  return {
    list: vi.fn().mockResolvedValue({
      contacts: [
        makeListItem(),
        makeListItem({ id: "contact-2", displayName: "Grace Hopper" }),
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    }),
    get: vi.fn().mockResolvedValue(makeDetail()),
    duplicates: vi
      .fn()
      .mockResolvedValue({ groups: [{ contacts: [makeListItem()] }] }),
    suggest: vi.fn().mockResolvedValue({
      suggestions: [
        {
          contactId: "contact-1",
          displayName: "Ada Lovelace",
          email: "ada@example.com",
        },
      ],
    }),
    create: vi.fn().mockImplementation(async (payload: ContactPayload) =>
      makeDetail({
        id: "contact-new",
        displayName: payload.organization ?? "Ada Lovelace",
      }),
    ),
    update: vi.fn().mockResolvedValue(makeDetail()),
    remove: vi.fn().mockResolvedValue(undefined),
    bulk: vi.fn().mockResolvedValue({ affected: 3 }),
    merge: vi.fn().mockResolvedValue(makeDetail()),
    listLabels: vi.fn().mockResolvedValue([
      {
        id: "label-1",
        name: "Friends",
        color: "BLUE",
        position: 0,
        contactCount: 4,
      },
    ]),
    createLabel: vi
      .fn()
      .mockResolvedValue({ id: "label-new", name: "Vendors", color: "RED" }),
    updateLabel: vi.fn().mockResolvedValue({
      id: "label-1",
      name: "Close friends",
      color: "BLUE",
    }),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    ...overrides,
  };
}

function toolNamed(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named "${name}" was returned.`);
  return tool;
}

/** The single argument the api mock was called with, typed as a payload. */
function payloadOf(mock: unknown, argIndex = 0): ContactPayload {
  const calls = (mock as { mock: { calls: unknown[][] } }).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][argIndex] as ContactPayload;
}

// The names the server-side catalog uses, which this domain mirrors so an
// agent that knows one surface knows the other.
const EXPECTED_TOOL_NAMES = [
  "contacts_list",
  "contacts_get",
  "contact_labels_list",
  "contacts_suggest",
  "contacts_duplicates",
  "contacts_create",
  "contacts_update",
  "contacts_delete",
  "contacts_bulk",
  "contacts_merge",
  "contact_label_create",
  "contact_label_update",
  "contact_label_delete",
];

describe("createContactsTools — catalog", () => {
  it("returns exactly the catalog's contacts tools", () => {
    const tools = createContactsTools(makeDeps());

    expect(tools.map((tool) => tool.name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("carries a non-empty title on every tool", () => {
    for (const tool of createContactsTools(makeDeps())) {
      expect(tool.title, tool.name).toBeTruthy();
    }
  });

  it("stays inside the name and description budgets", () => {
    for (const tool of createContactsTools(makeDeps())) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(30);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(500);
    }
  });

  it("marks the reads read-only and the writes not", () => {
    const tools = createContactsTools(makeDeps());
    const readOnly = tools
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);

    expect(readOnly).toEqual([
      "contacts_list",
      "contacts_get",
      "contact_labels_list",
      "contacts_suggest",
      "contacts_duplicates",
    ]);
  });

  it("flags every tool that returns operator-authored text as untrusted", () => {
    const tools = createContactsTools(makeDeps());
    const untrusted = tools
      .filter((tool) => tool.annotations.untrustedContentHint)
      .map((tool) => tool.name);

    // The three left out return only an id or a count.
    expect(untrusted).not.toContain("contacts_delete");
    expect(untrusted).not.toContain("contacts_bulk");
    expect(untrusted).not.toContain("contact_label_delete");
    expect(untrusted).toContain("contacts_list");
    expect(untrusted).toContain("contacts_get");
    expect(untrusted).toContain("contacts_update");
  });
});

describe("contacts_list", () => {
  it("returns the flat compact projection, not whole contact records", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_list");

    const result = await tool.execute({ query: "ada" });

    expect(expectToolJson(result)).toEqual({
      total: 2,
      page: 1,
      pageSize: 10,
      contacts: [
        {
          id: "contact-1",
          name: "Ada Lovelace",
          organization: "Analytical Engines",
          email: "ada@example.com",
          phone: "+44 20 7946 0000",
        },
        {
          id: "contact-2",
          name: "Grace Hopper",
          organization: "Analytical Engines",
          email: "ada@example.com",
          phone: "+44 20 7946 0000",
        },
      ],
    });
  });

  it("defaults to a modest page size and passes the filters through", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_list");

    await tool.execute({ query: "ada", labelId: "label-1", starred: true });

    expect(deps.list).toHaveBeenCalledWith({
      query: "ada",
      labelId: "label-1",
      starred: true,
      page: 1,
      pageSize: 10,
    });
  });

  it("rejects a page size above 50 without calling the api", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_list");

    const result = await tool.execute({ pageSize: 51 });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.list).not.toHaveBeenCalled();
  });

  it("keeps the result inside the per-tool output budget", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_list");

    const result = await tool.execute({});

    expect(expectToolText(result).length).toBeLessThan(1500);
  });

  it("surfaces a rejecting api call as an error result", async () => {
    const deps = makeDeps({
      list: vi.fn().mockRejectedValue(new Error("Workspace unavailable.")),
    });
    const tool = toolNamed(createContactsTools(deps), "contacts_list");

    const result = await tool.execute({});

    expect(expectToolError(result)).toBe("Workspace unavailable.");
  });
});

describe("contacts_get", () => {
  it("returns the whole record for one contact", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_get");

    const result = await tool.execute({ contactId: "contact-1" });
    const contact = expectToolJson<{
      notes: string;
      fields: unknown[];
      addresses: unknown[];
      labels: { id: string; name: string }[];
    }>(result);

    expect(deps.get).toHaveBeenCalledWith("contact-1");
    expect(contact.notes).toBe("Met at the Royal Society.");
    expect(contact.fields).toHaveLength(2);
    expect(contact.addresses).toHaveLength(1);
    expect(contact.labels).toEqual([{ id: "label-1", name: "Friends" }]);
  });
});

describe("contact_labels_list", () => {
  it("returns id, name and count per label", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contact_labels_list");

    const result = await tool.execute({});

    expect(expectToolJson(result)).toEqual({
      labels: [{ id: "label-1", name: "Friends", contactCount: 4 }],
    });
  });
});

describe("contacts_suggest", () => {
  it("returns the flat contactId/name/email rows", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_suggest");

    const result = await tool.execute({ query: "ada" });

    expect(deps.suggest).toHaveBeenCalledWith("ada");
    expect(expectToolJson(result)).toEqual({
      suggestions: [
        {
          contactId: "contact-1",
          name: "Ada Lovelace",
          email: "ada@example.com",
        },
      ],
    });
  });
});

describe("contacts_duplicates", () => {
  it("projects each group down to the compact rows", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_duplicates");

    const result = await tool.execute({});
    const { groups } = expectToolJson<{
      groups: { contacts: Record<string, unknown>[] }[];
    }>(result);

    expect(Object.keys(groups[0].contacts[0])).toEqual([
      "id",
      "name",
      "organization",
      "email",
      "phone",
    ]);
  });
});

describe("contacts_create", () => {
  it("builds a complete payload, defaulting every unmentioned key", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_create");

    const result = await tool.execute({
      firstName: "Grace",
      lastName: "Hopper",
      organization: "US Navy",
      jobTitle: "Rear Admiral",
      email: "grace@example.com",
      phone: "+1 202 555 0143",
      notes: "COBOL.",
      starred: true,
      labelIds: ["label-1"],
    });

    expect(payloadOf(deps.create)).toEqual({
      prefix: null,
      firstName: "Grace",
      middleName: null,
      lastName: "Hopper",
      suffix: null,
      phoneticFirst: null,
      phoneticMiddle: null,
      phoneticLast: null,
      nickname: null,
      fileAs: null,
      organization: "US Navy",
      jobTitle: "Rear Admiral",
      department: null,
      birthday: null,
      notes: "COBOL.",
      starred: true,
      fields: [
        {
          kind: "EMAIL",
          label: null,
          value: "grace@example.com",
          isPrimary: true,
        },
        {
          kind: "PHONE",
          label: null,
          value: "+1 202 555 0143",
          isPrimary: true,
        },
      ],
      addresses: [],
      labelIds: ["label-1"],
    });
    expect(expectToolJson(result)).toEqual({
      contactId: "contact-new",
      name: "US Navy",
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves fields empty when neither email nor phone is given", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_create");

    await tool.execute({ organization: "US Navy" });

    expect(payloadOf(deps.create).fields).toEqual([]);
  });

  it("errors when there is no name and no organization", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_create");

    const result = await tool.execute({ notes: "Nameless." });

    expect(expectToolError(result)).toBe(
      "A contact needs at least one of firstName, lastName or organization.",
    );
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("treats a blank name as no name at all", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_create");

    const result = await tool.execute({ firstName: "   " });

    expect(expectToolError(result)).toContain("at least one of firstName");
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed email without calling the api", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_create");

    const result = await tool.execute({
      firstName: "Grace",
      email: "not-an-address",
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("surfaces a rejecting create as an error result", async () => {
    const deps = makeDeps({
      create: vi.fn().mockRejectedValue(new Error("Contact limit reached.")),
    });
    const tool = toolNamed(createContactsTools(deps), "contacts_create");

    const result = await tool.execute({ firstName: "Grace" });

    expect(expectToolError(result)).toBe("Contact limit reached.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("contacts_update", () => {
  // The api's update is a full replace, so the handler has to read the record
  // and lay the caller's changes over it. This is the failure mode the whole
  // design exists to avoid.
  it("merges over the fetched record instead of wiping omitted fields", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    await tool.execute({ contactId: "contact-1", jobTitle: "Countess" });

    expect(deps.get).toHaveBeenCalledWith("contact-1");
    const payload = payloadOf(deps.update, 1);

    expect(payload.jobTitle).toBe("Countess");
    // Everything the caller never mentioned survives.
    expect(payload.firstName).toBe("Ada");
    expect(payload.lastName).toBe("Lovelace");
    expect(payload.nickname).toBe("Countess");
    expect(payload.department).toBe("Research");
    expect(payload.birthday).toBe("1815-12-10");
    expect(payload.notes).toBe("Met at the Royal Society.");
    expect(payload.organization).toBe("Analytical Engines");
    expect(payload.labelIds).toEqual(["label-1"]);
    expect(payload.addresses).toEqual([
      {
        label: "home",
        poBox: null,
        extended: null,
        street: "12 St James's Square",
        city: "London",
        region: null,
        postalCode: "SW1Y 4LE",
        country: "UK",
        formatted: null,
      },
    ]);
    expect(payload.fields).toEqual([
      {
        kind: "EMAIL",
        label: "work",
        value: "ada@example.com",
        isPrimary: true,
      },
      {
        kind: "URL",
        label: null,
        value: "https://ada.example.com",
        isPrimary: false,
      },
    ]);
  });

  it("rewrites the existing email in place, leaving other fields alone", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    await tool.execute({
      contactId: "contact-1",
      email: "ada@analytical.example",
    });

    expect(payloadOf(deps.update, 1).fields).toEqual([
      {
        kind: "EMAIL",
        label: "work",
        value: "ada@analytical.example",
        isPrimary: true,
      },
      {
        kind: "URL",
        label: null,
        value: "https://ada.example.com",
        isPrimary: false,
      },
    ]);
  });

  it("appends a phone the contact did not have yet", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    await tool.execute({ contactId: "contact-1", phone: "+1 202 555 0143" });

    const { fields } = payloadOf(deps.update, 1);
    expect(fields).toHaveLength(3);
    expect(fields[2]).toEqual({
      kind: "PHONE",
      label: null,
      value: "+1 202 555 0143",
      isPrimary: true,
    });
  });

  it("clears a text field when given an empty string", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    await tool.execute({ contactId: "contact-1", notes: "" });

    expect(payloadOf(deps.update, 1).notes).toBeNull();
  });

  it("replaces the whole label set when labelIds is given", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    await tool.execute({ contactId: "contact-1", labelIds: ["label-9"] });

    expect(payloadOf(deps.update, 1).labelIds).toEqual(["label-9"]);
  });

  it("refuses an update that would leave the contact nameless", async () => {
    const deps = makeDeps({
      get: vi.fn().mockResolvedValue(
        makeDetail({
          firstName: "Ada",
          lastName: null,
          organization: null,
        }),
      ),
    });
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    const result = await tool.execute({
      contactId: "contact-1",
      firstName: "",
    });

    expect(expectToolError(result)).toContain("at least one of firstName");
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("does not call update when the read fails", async () => {
    const deps = makeDeps({
      get: vi.fn().mockRejectedValue(new Error("Contact not found.")),
    });
    const tool = toolNamed(createContactsTools(deps), "contacts_update");

    const result = await tool.execute({ contactId: "gone", notes: "hi" });

    expect(expectToolError(result)).toBe("Contact not found.");
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe("contacts_delete", () => {
  it("deletes by id and refreshes", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_delete");

    const result = await tool.execute({ contactId: "contact-1" });

    expect(deps.remove).toHaveBeenCalledWith("contact-1");
    expect(expectToolJson(result)).toEqual({ deleted: "contact-1" });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("contacts_bulk", () => {
  it("passes an addLabel action through unchanged", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_bulk");

    const result = await tool.execute({
      contactIds: ["contact-1", "contact-2"],
      action: { type: "addLabel", labelId: "label-1" },
    });

    expect(deps.bulk).toHaveBeenCalledWith(["contact-1", "contact-2"], {
      type: "addLabel",
      labelId: "label-1",
    });
    expect(expectToolJson(result)).toEqual({ affected: 3 });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it("passes a star action through with its boolean", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_bulk");

    await tool.execute({
      contactIds: ["contact-1"],
      action: { type: "star", starred: false },
    });

    expect(deps.bulk).toHaveBeenCalledWith(["contact-1"], {
      type: "star",
      starred: false,
    });
  });

  it("passes a delete action through", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_bulk");

    await tool.execute({
      contactIds: ["contact-1"],
      action: { type: "delete" },
    });

    expect(deps.bulk).toHaveBeenCalledWith(["contact-1"], { type: "delete" });
  });

  it("rejects an unknown action type without calling the api", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_bulk");

    const result = await tool.execute({
      contactIds: ["contact-1"],
      action: { type: "archive" },
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.bulk).not.toHaveBeenCalled();
  });

  it("rejects a star action missing its boolean", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_bulk");

    const result = await tool.execute({
      contactIds: ["contact-1"],
      action: { type: "star" },
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.bulk).not.toHaveBeenCalled();
  });
});

describe("contacts_merge", () => {
  it("merges the others into the primary and reports the count", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_merge");

    const result = await tool.execute({
      primaryId: "contact-1",
      otherIds: ["contact-2", "contact-3"],
    });

    expect(deps.merge).toHaveBeenCalledWith("contact-1", [
      "contact-2",
      "contact-3",
    ]);
    expect(expectToolJson(result)).toEqual({
      contactId: "contact-1",
      name: "Ada Lovelace",
      mergedCount: 2,
    });
  });

  it("rejects an empty otherIds list", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contacts_merge");

    const result = await tool.execute({
      primaryId: "contact-1",
      otherIds: [],
    });

    expect(expectToolError(result)).toContain("Invalid input");
    expect(deps.merge).not.toHaveBeenCalled();
  });
});

describe("contact label tools", () => {
  it("creates a label with a name and a color", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contact_label_create");

    const result = await tool.execute({ name: "Vendors", color: "RED" });

    expect(deps.createLabel).toHaveBeenCalledWith("Vendors", "RED");
    expect(expectToolJson(result)).toEqual({
      labelId: "label-new",
      name: "Vendors",
      color: "RED",
    });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
  });

  it("updates only the keys the caller gave", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contact_label_update");

    await tool.execute({ labelId: "label-1", name: "Close friends" });

    expect(deps.updateLabel).toHaveBeenCalledWith("label-1", {
      name: "Close friends",
      color: undefined,
    });
  });

  it("deletes a label by id", async () => {
    const deps = makeDeps();
    const tool = toolNamed(createContactsTools(deps), "contact_label_delete");

    const result = await tool.execute({ labelId: "label-1" });

    expect(deps.removeLabel).toHaveBeenCalledWith("label-1");
    expect(expectToolJson(result)).toEqual({ deleted: "label-1" });
  });

  it("surfaces a rejecting label delete as an error result", async () => {
    const deps = makeDeps({
      removeLabel: vi.fn().mockRejectedValue(new Error("Label is in use.")),
    });
    const tool = toolNamed(createContactsTools(deps), "contact_label_delete");

    const result = await tool.execute({ labelId: "label-1" });

    expect(expectToolError(result)).toBe("Label is in use.");
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});
