import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto/credentials";
import * as mailAccountsService from "@/lib/services/mail-accounts";

// Mail account service (plan §4): CRUD with encrypted app-passwords, any
// workspace member may manage accounts, webhook-account protection. Uses
// mode MOCK everywhere so verify() runs against the in-memory driver — zero
// network calls.
// CREDENTIAL_ENCRYPTION_KEY is not in scripts/test-env.mjs's TEST_ENV_KEYS
// allowlist, so it must be set directly here — a fixed 64-char hex test key.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const NAME_PREFIX = `mail-acc-${randomUUID()}`;
let workspaceId: string;
let ownerId: string;
let memberId: string;

function accountInput(
  overrides: Partial<mailAccountsService.CreateMailAccountData> = {},
): mailAccountsService.CreateMailAccountData {
  return {
    name: `${NAME_PREFIX}-account`,
    email: "user@example.ru",
    imapHost: "imap.example.ru",
    imapPort: 993,
    imapSecurity: "SSL",
    smtpHost: "smtp.example.ru",
    smtpPort: 465,
    smtpSecurity: "SSL",
    username: "user@example.ru",
    password: "app-password-secret",
    mode: "MOCK",
    ...overrides,
  };
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const owner = await db.operator.create({
    data: { username: `${NAME_PREFIX}-owner`, passwordHash: "salt:hash" },
  });
  ownerId = owner.id;
  const member = await db.operator.create({
    data: { username: `${NAME_PREFIX}-member`, passwordHash: "salt:hash" },
  });
  memberId = member.id;

  await db.workspaceMember.createMany({
    data: [
      { workspaceId, operatorId: ownerId, role: "OWNER" },
      { workspaceId, operatorId: memberId, role: "MEMBER" },
    ],
  });
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  await db.operator
    .deleteMany({ where: { id: { in: [ownerId, memberId] } } })
    .catch(() => {});
});

describe("createAccount", () => {
  it("encrypts the password (round-trip via crypto) and verifies a MOCK account", async () => {
    const summary = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-create` }),
    );

    expect(summary.kind).toBe("IMAP");
    expect(summary.mode).toBe("MOCK");
    expect(summary.maskedHint).toBe("****cret");
    // MOCK driver verify() always succeeds — persisted on create.
    expect(summary.isValid).toBe(true);
    expect(summary.lastCheckedAt).toBeInstanceOf(Date);

    const stored = await db.mailAccount.findUnique({
      where: { id: summary.id },
    });
    expect(stored?.encryptedData).toBeTruthy();
    expect(stored?.encryptedData).not.toContain("app-password-secret");
    const decrypted = decrypt({
      encryptedData: stored!.encryptedData!,
      iv: stored!.iv!,
      authTag: stored!.authTag!,
    });
    expect(decrypted).toEqual({
      type: "MAIL_PASSWORD",
      imapPassword: "app-password-secret",
    });
  });

  it("allows a MEMBER to create an account (no owner-only gate)", async () => {
    const summary = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-member-allowed` }),
    );
    expect(summary.kind).toBe("IMAP");
  });
});

describe("listAccounts", () => {
  it("ensures the webhook account exists and returns no secret fields", async () => {
    const list = await mailAccountsService.listAccounts(workspaceId);

    const webhook = list.find((a) => a.kind === "WEBHOOK");
    expect(webhook).toBeTruthy();

    for (const account of list) {
      expect(account).not.toHaveProperty("encryptedData");
      expect(account).not.toHaveProperty("iv");
      expect(account).not.toHaveProperty("authTag");
      expect(account).not.toHaveProperty("password");
    }
  });
});

describe("updateAccount", () => {
  it("keeps the stored password when the input password is empty/absent", async () => {
    const created = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-update-keep` }),
    );

    const updated = await mailAccountsService.updateAccount(
      workspaceId,
      created.id,
      { name: `${NAME_PREFIX}-update-kept`, imapHost: "imap2.example.ru" },
    );
    expect(updated.name).toBe(`${NAME_PREFIX}-update-kept`);
    expect(updated.imapHost).toBe("imap2.example.ru");

    const stored = await db.mailAccount.findUnique({
      where: { id: created.id },
    });
    const decrypted = decrypt({
      encryptedData: stored!.encryptedData!,
      iv: stored!.iv!,
      authTag: stored!.authTag!,
    });
    expect(decrypted).toEqual({
      type: "MAIL_PASSWORD",
      imapPassword: "app-password-secret",
    });
  });

  it("re-encrypts when a new password is provided", async () => {
    const created = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-update-pass` }),
    );

    const updated = await mailAccountsService.updateAccount(
      workspaceId,
      created.id,
      { password: "new-app-password" },
    );
    expect(updated.maskedHint).toBe("****word");

    const stored = await db.mailAccount.findUnique({
      where: { id: created.id },
    });
    const decrypted = decrypt({
      encryptedData: stored!.encryptedData!,
      iv: stored!.iv!,
      authTag: stored!.authTag!,
    });
    expect(decrypted).toEqual({
      type: "MAIL_PASSWORD",
      imapPassword: "new-app-password",
    });
  });

  it("rejects connection-field changes on the WEBHOOK account", async () => {
    const list = await mailAccountsService.listAccounts(workspaceId);
    const webhook = list.find((a) => a.kind === "WEBHOOK")!;

    await expect(
      mailAccountsService.updateAccount(workspaceId, webhook.id, {
        imapHost: "imap.example.ru",
      }),
    ).rejects.toThrow(mailAccountsService.WebhookAccountProtectedError);

    // Renaming alone is allowed.
    const renamed = await mailAccountsService.updateAccount(
      workspaceId,
      webhook.id,
      { name: "Webhook" },
    );
    expect(renamed.name).toBe("Webhook");
  });
});

describe("deleteAccount", () => {
  it("deletes an IMAP account", async () => {
    const created = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-delete` }),
    );

    await mailAccountsService.deleteAccount(workspaceId, created.id);

    const stored = await db.mailAccount.findUnique({
      where: { id: created.id },
    });
    expect(stored).toBeNull();
  });

  it("refuses to delete the WEBHOOK account", async () => {
    const list = await mailAccountsService.listAccounts(workspaceId);
    const webhook = list.find((a) => a.kind === "WEBHOOK")!;

    await expect(
      mailAccountsService.deleteAccount(workspaceId, webhook.id),
    ).rejects.toThrow(mailAccountsService.WebhookAccountProtectedError);
  });
});

describe("testConnection", () => {
  it("returns imapOk/smtpOk true for a MOCK config", async () => {
    const result = await mailAccountsService.testConnection(
      accountInput({ mode: "MOCK" }),
    );
    expect(result).toEqual({ imapOk: true, smtpOk: true, error: null });
  });
});
