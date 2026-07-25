import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { ExternalIdentityProvider } from "@/generated/prisma/client";
import { findOrCreateOperatorForExternalIdentity } from "@/lib/services/external-identity";

// Authentik account linking/auto-provisioning. Identity is matched by the
// OIDC `sub` claim only — never by email, which can change/be reused at the
// IdP (see src/lib/services/external-identity.ts header comment).

const createdOperatorIds: string[] = [];

afterAll(async () => {
  // ExternalIdentity rows cascade-delete with their Operator
  // (onDelete: Cascade), so deleting Operators is sufficient cleanup.
  await db.operator.deleteMany({ where: { id: { in: createdOperatorIds } } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function uniqueSubject() {
  return `sub-${randomUUID()}`;
}

describe("findOrCreateOperatorForExternalIdentity", () => {
  it("auto-creates a new Operator + ExternalIdentity on first login", async () => {
    const subject = uniqueSubject();
    const username = `authentik-user-${randomUUID().slice(0, 8)}`;

    const { operator, created } = await findOrCreateOperatorForExternalIdentity(
      {
        subject,
        email: "new-user@example.com",
        preferredUsername: username,
      },
    );
    expect(created).toBe(true);
    createdOperatorIds.push(operator.id);

    expect(operator.username).toBe(username);
    expect(operator.passwordHash).toBeNull();
    expect(operator.email).toBe("new-user@example.com");

    const identity = await db.externalIdentity.findUnique({
      where: {
        provider_subject: {
          provider: ExternalIdentityProvider.AUTHENTIK,
          subject,
        },
      },
    });
    expect(identity?.operatorId).toBe(operator.id);
    expect(identity?.lastLoginAt).not.toBeNull();
  });

  it("returns the linked Operator on a repeat login and refreshes lastLoginAt/email", async () => {
    const subject = uniqueSubject();
    const { operator: first } = await findOrCreateOperatorForExternalIdentity({
      subject,
      email: "old@example.com",
      preferredUsername: `authentik-user-${randomUUID().slice(0, 8)}`,
    });
    createdOperatorIds.push(first.id);

    const { operator: second, created } =
      await findOrCreateOperatorForExternalIdentity({
        subject,
        email: "new@example.com",
      });
    expect(created).toBe(false);

    expect(second.id).toBe(first.id);

    const identity = await db.externalIdentity.findUnique({
      where: {
        provider_subject: {
          provider: ExternalIdentityProvider.AUTHENTIK,
          subject,
        },
      },
    });
    expect(identity?.email).toBe("new@example.com");
  });

  it("disambiguates a colliding preferred_username with a deterministic suffix", async () => {
    const takenUsername = `collide-${randomUUID().slice(0, 8)}`;
    const existing = await db.operator.create({
      data: { username: takenUsername, passwordHash: "salt:hash" },
    });
    createdOperatorIds.push(existing.id);

    const { operator, created } = await findOrCreateOperatorForExternalIdentity(
      {
        subject: uniqueSubject(),
        preferredUsername: takenUsername,
      },
    );
    expect(created).toBe(true);
    createdOperatorIds.push(operator.id);

    expect(operator.id).not.toBe(existing.id);
    expect(operator.username).toBe(`${takenUsername}-1`);
  });

  it("falls back to the email local-part when preferred_username is absent", async () => {
    const localPart = `local-${randomUUID().slice(0, 8)}`;
    const { operator, created } = await findOrCreateOperatorForExternalIdentity(
      {
        subject: uniqueSubject(),
        email: `${localPart}@example.com`,
      },
    );
    expect(created).toBe(true);
    createdOperatorIds.push(operator.id);

    expect(operator.username).toBe(localPart);
  });

  it("falls back to an authentik-<sub> username when no claims are usable", async () => {
    const subject = uniqueSubject();
    const { operator, created } = await findOrCreateOperatorForExternalIdentity(
      { subject },
    );
    expect(created).toBe(true);
    createdOperatorIds.push(operator.id);

    expect(operator.username).toBe(`authentik-${subject.slice(0, 8)}`);
  });

  it("resolves a concurrent first-login race on (provider, subject) to the winning row", async () => {
    const subject = uniqueSubject();
    // Simulate a concurrent request that already won the race by directly
    // creating the Operator + ExternalIdentity this call will collide with.
    const winner = await db.operator.create({
      data: { username: `race-winner-${randomUUID().slice(0, 8)}` },
    });
    createdOperatorIds.push(winner.id);
    await db.externalIdentity.create({
      data: {
        provider: ExternalIdentityProvider.AUTHENTIK,
        subject,
        operatorId: winner.id,
      },
    });

    // Force this call past the initial "already linked?" check (as if it ran
    // just before the winner's row was committed), so it proceeds to create
    // and hits the real unique-constraint violation on (provider, subject).
    vi.spyOn(db.externalIdentity, "findUnique").mockResolvedValueOnce(
      null as unknown as Awaited<
        ReturnType<typeof db.externalIdentity.findUnique>
      >,
    );

    const { operator, created } = await findOrCreateOperatorForExternalIdentity(
      {
        subject,
        preferredUsername: `race-loser-${randomUUID().slice(0, 8)}`,
      },
    );
    expect(created).toBe(false);

    expect(operator.id).toBe(winner.id);
  });

  it("retries with a fresh username after losing a race on Operator.username", async () => {
    const subject = uniqueSubject();
    const username = `race-username-${randomUUID().slice(0, 8)}`;

    // Force the first availability check to report the username as free (as
    // if this call ran just before a concurrent request claimed it), then
    // actually claim it — so the real create() call below hits a genuine
    // Operator.username unique-constraint violation.
    vi.spyOn(db.operator, "findUnique").mockResolvedValueOnce(
      null as unknown as Awaited<ReturnType<typeof db.operator.findUnique>>,
    );
    const concurrentWinner = await db.operator.create({
      data: { username },
    });
    createdOperatorIds.push(concurrentWinner.id);

    const { operator, created } = await findOrCreateOperatorForExternalIdentity(
      {
        subject,
        preferredUsername: username,
      },
    );
    expect(created).toBe(true);
    createdOperatorIds.push(operator.id);

    expect(operator.id).not.toBe(concurrentWinner.id);
    expect(operator.username).toBe(`${username}-1`);
  });
});
