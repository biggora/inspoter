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
  const name = overrides.name ?? `${NAME_PREFIX}-account`;
  // One mailbox is one account, so each fixture needs its own address —
  // otherwise every account after the first would be a duplicate of it.
  const email = overrides.email ?? `${name}@example.ru`;
  return {
    name,
    email,
    imapHost: "imap.example.ru",
    imapPort: 993,
    imapSecurity: "SSL",
    smtpHost: "smtp.example.ru",
    smtpPort: 465,
    smtpSecurity: "SSL",
    username: email,
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

  it("refuses a second account for a mailbox already connected", async () => {
    const first = accountInput({
      name: `${NAME_PREFIX}-mailbox-owner`,
      email: `${NAME_PREFIX}-shared@example.ru`,
    });
    await mailAccountsService.createAccount(workspaceId, first);

    // Another display name, another app password, casing that differs: still
    // the same mailbox.
    await expect(
      mailAccountsService.createAccount(
        workspaceId,
        accountInput({
          name: `${NAME_PREFIX}-mailbox-copy`,
          email: first.email.toUpperCase(),
          imapHost: "IMAP.example.ru",
          password: "another-app-password",
        }),
      ),
    ).rejects.toBeInstanceOf(mailAccountsService.DuplicateMailboxError);

    const stored = await db.mailAccount.findMany({
      where: {
        workspaceId,
        email: { in: [first.email, first.email.toUpperCase()] },
      },
    });
    expect(stored).toHaveLength(1);
  });

  it("accepts the same address on a different IMAP host", async () => {
    const address = `${NAME_PREFIX}-two-hosts@example.ru`;
    await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-host-a`, email: address }),
    );
    const second = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({
        name: `${NAME_PREFIX}-host-b`,
        email: address,
        imapHost: "imap.other.ru",
      }),
    );
    expect(second.imapHost).toBe("imap.other.ru");
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
  it("keeps exactly one workspace default account", async () => {
    const first = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-default-first` }),
    );
    const second = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-default-second` }),
    );

    await mailAccountsService.updateAccount(workspaceId, first.id, {
      isDefault: true,
    });
    const selected = await mailAccountsService.updateAccount(
      workspaceId,
      second.id,
      { isDefault: true },
    );

    expect(selected.isDefault).toBe(true);
    const defaults = await db.mailAccount.findMany({
      where: { workspaceId, isDefault: true },
    });
    expect(defaults.map((account) => account.id)).toEqual([second.id]);
  });

  it("promotes the oldest remaining IMAP account when the default is deleted", async () => {
    const workspace = await db.workspace.create({
      data: {
        name: "Default Mailbox Replacement",
        slug: `default-mailbox-${randomUUID()}`,
        updatedAt: new Date(),
      },
    });

    try {
      const first = await mailAccountsService.createAccount(
        workspace.id,
        accountInput({ name: `${NAME_PREFIX}-replacement-first` }),
      );
      const second = await mailAccountsService.createAccount(
        workspace.id,
        accountInput({ name: `${NAME_PREFIX}-replacement-second` }),
      );
      await mailAccountsService.updateAccount(workspace.id, second.id, {
        isDefault: true,
      });

      await mailAccountsService.deleteAccount(workspace.id, second.id);

      const replacement = await db.mailAccount.findFirstOrThrow({
        where: { workspaceId: workspace.id, isDefault: true },
      });
      expect(replacement.id).toBe(first.id);
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } });
    }
  });

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

  it("refuses to point an account at a mailbox another account already holds", async () => {
    const taken = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-taken` }),
    );
    const mover = await mailAccountsService.createAccount(
      workspaceId,
      accountInput({ name: `${NAME_PREFIX}-mover` }),
    );

    await expect(
      mailAccountsService.updateAccount(workspaceId, mover.id, {
        email: taken.email,
      }),
    ).rejects.toBeInstanceOf(mailAccountsService.DuplicateMailboxError);

    // Editing an account without moving it stays allowed.
    const renamed = await mailAccountsService.updateAccount(
      workspaceId,
      mover.id,
      { name: `${NAME_PREFIX}-mover-renamed`, email: mover.email },
    );
    expect(renamed.name).toBe(`${NAME_PREFIX}-mover-renamed`);
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
      workspaceId,
      accountInput({ mode: "MOCK" }),
    );
    expect(result).toEqual({
      imapOk: true,
      smtpOk: true,
      error: null,
      imapFailure: null,
      smtpFailure: null,
    });
  });
});
