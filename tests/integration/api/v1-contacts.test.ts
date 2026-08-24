import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as contactsService from "@/lib/services/contacts";
import {
  GET as listContacts,
  POST as createContact,
} from "@/app/api/v1/contacts/route";
import {
  DELETE as deleteContact,
  GET as getContact,
} from "@/app/api/v1/contacts/[contactId]/route";
import {
  DELETE as clearPhoto,
  GET as getPhoto,
  POST as setPhoto,
} from "@/app/api/v1/contacts/[contactId]/photo/route";
import { PATCH as bulkUpdate } from "@/app/api/v1/contacts/bulk/route";
import { GET as listDuplicates } from "@/app/api/v1/contacts/duplicates/route";
import { POST as mergeContacts } from "@/app/api/v1/contacts/merge/route";
import { GET as exportContacts } from "@/app/api/v1/contacts/export/route";
import { POST as importContacts } from "@/app/api/v1/contacts/import/route";
import { GET as suggestRecipients } from "@/app/api/v1/contacts/suggest/route";
import { POST as createLabel } from "@/app/api/v1/contacts/labels/route";
import {
  DELETE as deleteLabel,
  PATCH as updateLabel,
} from "@/app/api/v1/contacts/labels/[labelId]/route";

// The operations /api/v1/contacts/** gained on top of its original list,
// read, create, update, delete and labels: bulk actions, duplicate detection
// and merge, import and export, recipient suggestions, the label lifecycle and
// the contact photo.

const PREFIX = `v1-contacts-${randomUUID()}`;

// A 1x1 GIF — the smallest input that survives the content-type allowlist.
const GIF_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

let workspaceId: string;
let otherWorkspaceId: string;
let writeToken: string;
let readToken: string;
let otherWorkspaceToken: string;

function request(
  path: string,
  init: {
    method?: string;
    token?: string | null;
    body?: unknown;
    form?: FormData;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.form === undefined) headers.set("Content-Type", "application/json");
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.form !== undefined
      ? { body: init.form }
      : init.body === undefined
        ? {}
        : { body: JSON.stringify(init.body) }),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function seedContact(firstName: string, email: string) {
  const contact = await contactsService.createContact(workspaceId, null, {
    prefix: null,
    firstName,
    middleName: null,
    lastName: null,
    suffix: null,
    nickname: null,
    organization: null,
    jobTitle: null,
    department: null,
    birthday: null,
    notes: null,
    starred: false,
    fields: [{ kind: "EMAIL", label: null, value: email, isPrimary: true }],
    addresses: [],
    labelIds: [],
  });
  return contact.id;
}

beforeAll(async () => {
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
    }),
    db.workspace.create({
      data: { name: `${PREFIX}-other`, slug: `${PREFIX}-other` },
    }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;

  writeToken = (
    await webhookTokensService.create(workspaceId, "agent", [
      "contacts:read",
      "contacts:write",
    ])
  ).token;
  readToken = (
    await webhookTokensService.create(workspaceId, "agent-ro", [
      "contacts:read",
    ])
  ).token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", [
      "contacts:read",
      "contacts:write",
    ])
  ).token;
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("error envelope", () => {
  it("answers 404 in the shared uppercase code the rest of /api/v1 uses", async () => {
    const response = await getContact(
      request("/api/v1/contacts/does-not-exist", { token: readToken }),
      params({ contactId: "does-not-exist" }),
    );

    expect(response.status).toBe(404);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("answers 403 when the token lacks the write scope", async () => {
    const response = await bulkUpdate(
      request("/api/v1/contacts/bulk", {
        method: "PATCH",
        token: readToken,
        body: { contactIds: ["whatever"], action: { type: "delete" } },
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("bulk actions", () => {
  it("stars and then deletes several contacts", async () => {
    const ids = await Promise.all([
      seedContact(`${PREFIX}-bulk-one`, "bulk1@example.invalid"),
      seedContact(`${PREFIX}-bulk-two`, "bulk2@example.invalid"),
    ]);

    const starred = await bulkUpdate(
      request("/api/v1/contacts/bulk", {
        method: "PATCH",
        token: writeToken,
        body: { contactIds: ids, action: { type: "star", starred: true } },
      }),
    );
    expect(await body(starred)).toEqual({ updated: 2 });
    expect(
      await db.contact.count({ where: { id: { in: ids }, starred: true } }),
    ).toBe(2);

    const removed = await bulkUpdate(
      request("/api/v1/contacts/bulk", {
        method: "PATCH",
        token: writeToken,
        body: { contactIds: ids, action: { type: "delete" } },
      }),
    );
    expect(await body(removed)).toEqual({ updated: 2 });
    expect(await db.contact.count({ where: { id: { in: ids } } })).toBe(0);
  });

  it("ignores ids belonging to another workspace", async () => {
    const mine = await seedContact(`${PREFIX}-mine`, "mine@example.invalid");

    const response = await bulkUpdate(
      request("/api/v1/contacts/bulk", {
        method: "PATCH",
        token: otherWorkspaceToken,
        body: { contactIds: [mine], action: { type: "delete" } },
      }),
    );

    expect(await body(response)).toEqual({ updated: 0 });
    expect(await db.contact.findUnique({ where: { id: mine } })).not.toBe(null);
  });
});

describe("duplicates and merge", () => {
  it("groups records sharing an address and folds them into one", async () => {
    const primary = await seedContact(
      `${PREFIX}-grace`,
      "grace@example.invalid",
    );
    const duplicate = await seedContact(
      `${PREFIX}-grace`,
      "grace@example.invalid",
    );

    const groups = await listDuplicates(
      request("/api/v1/contacts/duplicates", { token: readToken }),
    );
    const payload =
      await body<Array<{ contacts: Array<{ id: string }> }>>(groups);
    const group = payload.find((entry) =>
      entry.contacts.some((contact) => contact.id === primary),
    );
    expect(group?.contacts.map((contact) => contact.id).sort()).toEqual(
      [primary, duplicate].sort(),
    );

    const merged = await mergeContacts(
      request("/api/v1/contacts/merge", {
        method: "POST",
        token: writeToken,
        body: { primaryId: primary, otherIds: [duplicate] },
      }),
    );
    expect(merged.status).toBe(200);
    expect((await body<{ id: string }>(merged)).id).toBe(primary);
    expect(
      await db.contact.findUnique({ where: { id: duplicate } }),
    ).toBeNull();
  });

  it("answers 404 when the primary belongs to another workspace", async () => {
    const mine = await seedContact(
      `${PREFIX}-private`,
      "private@example.invalid",
    );

    const response = await mergeContacts(
      request("/api/v1/contacts/merge", {
        method: "POST",
        token: otherWorkspaceToken,
        body: { primaryId: mine, otherIds: ["whatever"] },
      }),
    );

    expect(response.status).toBe(404);
  });
});

describe("import, export and suggestions", () => {
  const vcard = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Imported Person",
    "N:Person;Imported;;;",
    "EMAIL:imported@example.invalid",
    "END:VCARD",
  ].join("\r\n");

  it("imports a vCard, exports it back and suggests its address", async () => {
    const form = new FormData();
    form.set("file", new File([vcard], "contacts.vcf", { type: "text/vcard" }));

    const imported = await importContacts(
      request("/api/v1/contacts/import", {
        method: "POST",
        token: writeToken,
        form,
      }),
    );
    expect(imported.status).toBe(200);
    expect(await body(imported)).toMatchObject({
      format: "vcard",
      parsed: 1,
      created: 1,
    });

    const exported = await exportContacts(
      request(
        "/api/v1/contacts/export?format=vcard-4.0&query=Imported%20Person",
        { token: readToken },
      ),
    );
    const file = await body<{ content: string; count: number }>(exported);
    expect(file.count).toBe(1);
    expect(file.content).toContain("Imported Person");

    const suggested = await suggestRecipients(
      request("/api/v1/contacts/suggest?query=imported", { token: readToken }),
    );
    expect(
      (await body<Array<{ email: string }>>(suggested)).map(
        (entry) => entry.email,
      ),
    ).toContain("imported@example.invalid");
  });

  it("rejects an import with no file part", async () => {
    const response = await importContacts(
      request("/api/v1/contacts/import", {
        method: "POST",
        token: writeToken,
        form: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("rejects an export with no format", async () => {
    const response = await exportContacts(
      request("/api/v1/contacts/export", { token: readToken }),
    );

    expect(response.status).toBe(400);
  });
});

describe("labels", () => {
  it("creates, renames and deletes a label, and answers 409 on a duplicate name", async () => {
    const created = await createLabel(
      request("/api/v1/contacts/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-vendors`, color: "GREEN" },
      }),
    );
    expect(created.status).toBe(201);
    const { id } = await body<{ id: string }>(created);

    const duplicate = await createLabel(
      request("/api/v1/contacts/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${PREFIX}-VENDORS`, color: "BLUE" },
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await body<{ error: { code: string } }>(duplicate)).toMatchObject({
      error: { code: "LABEL_NAME_CONFLICT" },
    });

    const renamed = await updateLabel(
      request(`/api/v1/contacts/labels/${id}`, {
        method: "PATCH",
        token: writeToken,
        body: { name: `${PREFIX}-suppliers` },
      }),
      params({ labelId: id }),
    );
    expect(await body<{ name: string }>(renamed)).toMatchObject({
      name: `${PREFIX}-suppliers`,
    });

    const removed = await deleteLabel(
      request(`/api/v1/contacts/labels/${id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId: id }),
    );
    expect(await body(removed)).toEqual({ deleted: id });
  });

  it("answers 404 for a label of another workspace", async () => {
    // Contact label names cap at 60 chars (validation/contacts.ts), one
    // char shorter than PREFIX plus a suffix, so use a short random name.
    const created = await createLabel(
      request("/api/v1/contacts/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `l-${randomUUID().slice(0, 8)}`, color: "VIOLET" },
      }),
    );
    const { id } = await body<{ id: string }>(created);

    const response = await deleteLabel(
      request(`/api/v1/contacts/labels/${id}`, {
        method: "DELETE",
        token: otherWorkspaceToken,
      }),
      params({ labelId: id }),
    );

    expect(response.status).toBe(404);
    expect(await db.contactLabel.findUnique({ where: { id } })).not.toBe(null);
  });
});

describe("photo", () => {
  it("stores, serves and clears a contact photo", async () => {
    const contactId = await seedContact(
      `${PREFIX}-photo`,
      "photo@example.invalid",
    );

    const missing = await getPhoto(
      request(`/api/v1/contacts/${contactId}/photo`, { token: readToken }),
      params({ contactId }),
    );
    expect(missing.status).toBe(404);

    const form = new FormData();
    form.set(
      "photo",
      new File([new Uint8Array(GIF_BYTES)], "avatar.gif", {
        type: "image/gif",
      }),
    );
    const stored = await setPhoto(
      request(`/api/v1/contacts/${contactId}/photo`, {
        method: "POST",
        token: writeToken,
        form,
      }),
      params({ contactId }),
    );
    expect(stored.status).toBe(200);
    expect(await body(stored)).toEqual({ updated: contactId });

    const served = await getPhoto(
      request(`/api/v1/contacts/${contactId}/photo`, { token: readToken }),
      params({ contactId }),
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/gif");
    expect((await served.arrayBuffer()).byteLength).toBe(GIF_BYTES.byteLength);

    const cleared = await clearPhoto(
      request(`/api/v1/contacts/${contactId}/photo`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ contactId }),
    );
    expect(await body(cleared)).toEqual({ deleted: contactId });
  });

  it("rejects a photo type that could be served as script", async () => {
    const contactId = await seedContact(`${PREFIX}-svg`, "svg@example.invalid");
    const form = new FormData();
    form.set(
      "photo",
      new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" }),
    );

    const response = await setPhoto(
      request(`/api/v1/contacts/${contactId}/photo`, {
        method: "POST",
        token: writeToken,
        form,
      }),
      params({ contactId }),
    );

    expect(response.status).toBe(415);
    expect(await contactsService.getPhoto(workspaceId, contactId)).toBeNull();
  });
});

describe("list and create still behave", () => {
  it("creates a contact and finds it in the paginated list", async () => {
    const created = await createContact(
      request("/api/v1/contacts", {
        method: "POST",
        token: writeToken,
        body: {
          firstName: `${PREFIX}-ada`,
          fields: [
            { kind: "EMAIL", value: "ada@example.invalid", isPrimary: true },
          ],
        },
      }),
    );
    expect(created.status).toBe(201);
    const { id } = await body<{ id: string }>(created);

    const listed = await listContacts(
      request(`/api/v1/contacts?query=${PREFIX}-ada`, { token: readToken }),
    );
    const page = await body<{ contacts: Array<{ id: string }>; total: number }>(
      listed,
    );
    expect(page.total).toBe(1);
    expect(page.contacts[0].id).toBe(id);

    const removed = await deleteContact(
      request(`/api/v1/contacts/${id}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ contactId: id }),
    );
    expect(await body(removed)).toEqual({ deleted: id });
  });
});
