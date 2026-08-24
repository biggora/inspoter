import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as mailService from "@/lib/services/mail";
import * as mailAccounts from "@/lib/services/mail-accounts";
import { GET as listMail } from "@/app/api/v1/mail/route";
import {
  DELETE as deleteMail,
  GET as getMail,
  PATCH as setMailRead,
} from "@/app/api/v1/mail/[mailId]/route";
import { POST as moveMail } from "@/app/api/v1/mail/[mailId]/move/route";
import {
  DELETE as removeMailLabel,
  PUT as assignMailLabel,
} from "@/app/api/v1/mail/[mailId]/labels/[labelId]/route";
import { GET as getAttachment } from "@/app/api/v1/mail/[mailId]/attachments/[attachmentId]/route";
import { GET as listAccounts } from "@/app/api/v1/mail/accounts/route";
import { GET as listFolders } from "@/app/api/v1/mail/accounts/[accountId]/folders/route";
import { POST as syncAccount } from "@/app/api/v1/mail/accounts/[accountId]/sync/route";
import { POST as sendMail } from "@/app/api/v1/mail/send/route";
import {
  GET as listLabels,
  POST as createLabel,
} from "@/app/api/v1/mail/labels/route";
import {
  DELETE as deleteLabel,
  PATCH as updateLabel,
} from "@/app/api/v1/mail/labels/[labelId]/route";
import {
  GET as listFilterRules,
  POST as createFilterRule,
} from "@/app/api/v1/mail/filter-rules/route";
import {
  DELETE as deleteFilterRule,
  PATCH as updateFilterRule,
} from "@/app/api/v1/mail/filter-rules/[ruleId]/route";

// /api/v1/mail/** end-to-end. Everything here runs against the workspace's
// WEBHOOK account, which has no IMAP or SMTP transport: mail-actions skips the
// driver for a webhook item, so read state, moves, deletes and labels are
// exercised without a network. The paths that genuinely need a transport —
// sending and syncing — are asserted through their refusals instead.

const PREFIX = `v1-mail-${randomUUID()}`;
// Mail label names cap at 40 chars (validation/mail.ts), too short for
// PREFIX plus a suffix, so label tests build names from this instead.
const SHORT = randomUUID().slice(0, 8);

let workspaceId: string;
let otherWorkspaceId: string;
let writeToken: string;
let readToken: string;
let otherWorkspaceToken: string;
let accountId: string;
let inboxFolderId: string;
let archiveFolderId: string;

function request(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function seedMessage(subject: string) {
  const { id } = await mailService.create(workspaceId, {
    sender: "ops@example.invalid",
    subject,
    body: `Body of ${subject}.`,
  });
  return id;
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
      "mail:read",
      "mail:write",
    ])
  ).token;
  readToken = (
    await webhookTokensService.create(workspaceId, "agent-ro", ["mail:read"])
  ).token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", [
      "mail:read",
      "mail:write",
    ])
  ).token;

  const mailbox = await mailAccounts.getOrCreateWebhookAccount(workspaceId);
  accountId = mailbox.account.id;
  inboxFolderId = mailbox.inboxFolder.id;

  const archive = await db.mailFolder.create({
    data: {
      workspaceId,
      accountId,
      accountWorkspaceId: workspaceId,
      name: "Archive",
      path: "Archive",
      specialUse: "ARCHIVE",
    },
  });
  archiveFolderId = archive.id;
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("authentication and scopes", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await listMail(request("/api/v1/mail"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects a read-only token on a write operation", async () => {
    const id = await seedMessage(`${PREFIX}-scope`);

    const response = await setMailRead(
      request(`/api/v1/mail/${id}`, {
        method: "PATCH",
        token: readToken,
        body: { isRead: true },
      }),
      params({ mailId: id }),
    );

    expect(response.status).toBe(403);
    expect((await db.mailItem.findUnique({ where: { id } }))?.isRead).toBe(
      false,
    );
  });
});

describe("reading and organizing", () => {
  it("lists, reads, marks read, moves and deletes a message", async () => {
    const id = await seedMessage(`${PREFIX}-lifecycle`);

    const listed = await listMail(
      request(`/api/v1/mail?query=${PREFIX}-lifecycle`, { token: readToken }),
    );
    expect(listed.status).toBe(200);
    const page = await body<{
      items: Array<{ id: string }>;
      nextCursor: string | null;
    }>(listed);
    expect(page.items.map((item) => item.id)).toEqual([id]);
    expect(page.nextCursor).toBeNull();

    const detail = await getMail(
      request(`/api/v1/mail/${id}`, { token: readToken }),
      params({ mailId: id }),
    );
    expect(await body<{ bodyText: string }>(detail)).toMatchObject({
      bodyText: `Body of ${PREFIX}-lifecycle.`,
    });

    const marked = await setMailRead(
      request(`/api/v1/mail/${id}`, {
        method: "PATCH",
        token: writeToken,
        body: { isRead: true },
      }),
      params({ mailId: id }),
    );
    expect(await body(marked)).toEqual({ id, isRead: true });
    expect((await db.mailItem.findUnique({ where: { id } }))?.isRead).toBe(
      true,
    );

    const moved = await moveMail(
      request(`/api/v1/mail/${id}/move`, {
        method: "POST",
        token: writeToken,
        body: { targetFolderId: archiveFolderId },
      }),
      params({ mailId: id }),
    );
    expect(await body(moved)).toEqual({ id, folderId: archiveFolderId });
    expect((await db.mailItem.findUnique({ where: { id } }))?.folderId).toBe(
      archiveFolderId,
    );

    // The webhook account has no Trash, so the first delete is permanent.
    const removed = await deleteMail(
      request(`/api/v1/mail/${id}`, { method: "DELETE", token: writeToken }),
      params({ mailId: id }),
    );
    expect(await body(removed)).toEqual({ id, status: "deleted" });
    expect(await db.mailItem.findUnique({ where: { id } })).toBeNull();
  });

  it("refuses a move into another account's folder", async () => {
    const id = await seedMessage(`${PREFIX}-foreign-folder`);
    const otherMailbox =
      await mailAccounts.getOrCreateWebhookAccount(otherWorkspaceId);

    const response = await moveMail(
      request(`/api/v1/mail/${id}/move`, {
        method: "POST",
        token: writeToken,
        body: { targetFolderId: otherMailbox.inboxFolder.id },
      }),
      params({ mailId: id }),
    );

    expect(response.status).toBe(400);
    expect((await db.mailItem.findUnique({ where: { id } }))?.folderId).toBe(
      inboxFolderId,
    );
  });

  it("answers 404 for a message of another workspace", async () => {
    const id = await seedMessage(`${PREFIX}-private`);

    const response = await getMail(
      request(`/api/v1/mail/${id}`, { token: otherWorkspaceToken }),
      params({ mailId: id }),
    );

    expect(response.status).toBe(404);
    expect(await db.mailItem.findUnique({ where: { id } })).not.toBe(null);
  });

  it("returns an attachment's bytes base64-encoded", async () => {
    const id = await seedMessage(`${PREFIX}-attachment`);
    const content = Buffer.from("report,rows\n1,2\n", "utf8");
    const attachment = await db.mailAttachment.create({
      data: {
        mailItemId: id,
        filename: "report.csv",
        contentType: "text/csv",
        sizeBytes: content.byteLength,
        content,
      },
    });

    const response = await getAttachment(
      request(`/api/v1/mail/${id}/attachments/${attachment.id}`, {
        token: readToken,
      }),
      params({ mailId: id, attachmentId: attachment.id }),
    );

    expect(response.status).toBe(200);
    const payload = await body<{
      filename: string;
      contentBase64: string;
    }>(response);
    expect(payload.filename).toBe("report.csv");
    expect(Buffer.from(payload.contentBase64, "base64").toString("utf8")).toBe(
      "report,rows\n1,2\n",
    );
  });
});

describe("accounts", () => {
  it("lists accounts and their folders without exposing a password", async () => {
    const accounts = await listAccounts(
      request("/api/v1/mail/accounts", { token: readToken }),
    );
    const payload = await body<Array<Record<string, unknown>>>(accounts);
    expect(payload.map((entry) => entry.id)).toContain(accountId);
    for (const entry of payload) {
      expect(Object.keys(entry)).not.toContain("password");
      expect(Object.keys(entry)).not.toContain("imapPassword");
    }

    const folders = await listFolders(
      request(`/api/v1/mail/accounts/${accountId}/folders`, {
        token: readToken,
      }),
      params({ accountId }),
    );
    expect(
      (await body<Array<{ id: string }>>(folders)).map((entry) => entry.id),
    ).toEqual(expect.arrayContaining([inboxFolderId, archiveFolderId]));
  });

  it("refuses to sync the inbound-only webhook account", async () => {
    const response = await syncAccount(
      request(`/api/v1/mail/accounts/${accountId}/sync`, {
        method: "POST",
        token: writeToken,
      }),
      params({ accountId }),
    );

    expect(response.status).toBe(400);
    expect(await body<{ error: { code: string } }>(response)).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("refuses to send from the inbound-only webhook account", async () => {
    const response = await sendMail(
      request("/api/v1/mail/send", {
        method: "POST",
        token: writeToken,
        body: {
          accountId,
          to: ["someone@example.invalid"],
          subject: "Should not be sent",
          bodyText: "No transport here.",
        },
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("labels", () => {
  it("creates a label, puts it on a message and takes it off again", async () => {
    const id = await seedMessage(`${PREFIX}-labelled`);

    const created = await createLabel(
      request("/api/v1/mail/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-invoices`, color: "GREEN" },
      }),
    );
    expect(created.status).toBe(201);
    const labelId = (await body<{ id: string }>(created)).id;

    const assigned = await assignMailLabel(
      request(`/api/v1/mail/${id}/labels/${labelId}`, {
        method: "PUT",
        token: writeToken,
      }),
      params({ mailId: id, labelId }),
    );
    expect(assigned.status).toBe(200);
    expect(
      await db.mailItemLabel.count({ where: { mailItemId: id, labelId } }),
    ).toBe(1);

    const removed = await removeMailLabel(
      request(`/api/v1/mail/${id}/labels/${labelId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ mailId: id, labelId }),
    );
    expect(await body(removed)).toEqual({ id, labelId, removed: true });
    expect(
      await db.mailItemLabel.count({ where: { mailItemId: id, labelId } }),
    ).toBe(0);

    const listed = await listLabels(
      request("/api/v1/mail/labels", { token: readToken }),
    );
    expect(
      (await body<Array<{ id: string }>>(listed)).map((entry) => entry.id),
    ).toContain(labelId);

    const renamed = await updateLabel(
      request(`/api/v1/mail/labels/${labelId}`, {
        method: "PATCH",
        token: writeToken,
        body: { color: "AMBER" },
      }),
      params({ labelId }),
    );
    expect(await body<{ color: string }>(renamed)).toMatchObject({
      color: "AMBER",
    });

    const deleted = await deleteLabel(
      request(`/api/v1/mail/labels/${labelId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId }),
    );
    expect(await body(deleted)).toEqual({ deleted: labelId });
  });

  it("answers 409 on a duplicate label name", async () => {
    const first = await createLabel(
      request("/api/v1/mail/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-receipts`, color: "BLUE" },
      }),
    );
    const labelId = (await body<{ id: string }>(first)).id;

    const duplicate = await createLabel(
      request("/api/v1/mail/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-RECEIPTS`, color: "RED" },
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await body<{ error: { code: string } }>(duplicate)).toMatchObject({
      error: { code: "LABEL_NAME_CONFLICT" },
    });

    await deleteLabel(
      request(`/api/v1/mail/labels/${labelId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId }),
    );
  });
});

describe("filter rules", () => {
  it("creates, lists, updates and deletes a rule", async () => {
    const label = await createLabel(
      request("/api/v1/mail/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-alerts`, color: "RED" },
      }),
    );
    const labelId = (await body<{ id: string }>(label)).id;

    const created = await createFilterRule(
      request("/api/v1/mail/filter-rules", {
        method: "POST",
        token: writeToken,
        body: {
          accountId,
          labelId,
          name: `${PREFIX}-from-ops`,
          conditions: [
            {
              field: "FROM_ADDRESS",
              operator: "CONTAINS",
              value: "ops@example.invalid",
              isNegated: false,
            },
          ],
        },
      }),
    );
    expect(created.status).toBe(201);
    const ruleId = (await body<{ id: string }>(created)).id;

    const listed = await listFilterRules(
      request(`/api/v1/mail/filter-rules?accountId=${accountId}`, {
        token: readToken,
      }),
    );
    expect(
      (await body<Array<{ id: string }>>(listed)).map((entry) => entry.id),
    ).toEqual([ruleId]);

    const paused = await updateFilterRule(
      request(`/api/v1/mail/filter-rules/${ruleId}`, {
        method: "PATCH",
        token: writeToken,
        body: { isActive: false },
      }),
      params({ ruleId }),
    );
    expect(await body<{ isActive: boolean }>(paused)).toMatchObject({
      isActive: false,
    });

    const removed = await deleteFilterRule(
      request(`/api/v1/mail/filter-rules/${ruleId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ ruleId }),
    );
    expect(await body(removed)).toEqual({ deleted: ruleId });

    await deleteLabel(
      request(`/api/v1/mail/labels/${labelId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId }),
    );
  });

  it("rejects a rule with no predicate", async () => {
    const label = await createLabel(
      request("/api/v1/mail/labels", {
        method: "POST",
        token: writeToken,
        body: { name: `${SHORT}-empty`, color: "SLATE" },
      }),
    );
    const labelId = (await body<{ id: string }>(label)).id;

    const response = await createFilterRule(
      request("/api/v1/mail/filter-rules", {
        method: "POST",
        token: writeToken,
        body: { accountId, labelId, name: `${PREFIX}-no-predicate` },
      }),
    );

    expect(response.status).toBe(400);
    expect(
      await db.mailFilterRule.count({
        where: { name: `${PREFIX}-no-predicate` },
      }),
    ).toBe(0);

    await deleteLabel(
      request(`/api/v1/mail/labels/${labelId}`, {
        method: "DELETE",
        token: writeToken,
      }),
      params({ labelId }),
    );
  });

  it("requires an accountId on the rule list", async () => {
    const response = await listFilterRules(
      request("/api/v1/mail/filter-rules", { token: readToken }),
    );

    expect(response.status).toBe(400);
  });
});
