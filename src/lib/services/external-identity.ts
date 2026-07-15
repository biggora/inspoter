import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  Prisma,
  ExternalIdentityProvider,
  type Operator,
} from "@/generated/prisma/client";

// Authentik (and future OIDC provider) account linking/auto-provisioning.
// Identity is matched by the OIDC `sub` claim (stable, provider-scoped) —
// NEVER by email, which can change or be reused at the IdP.

export interface ExternalIdentityClaims {
  subject: string;
  email?: string;
  preferredUsername?: string;
}

const MAX_USERNAME_ATTEMPTS = 5;
const MAX_DETERMINISTIC_SUFFIX = 20;

function isPrismaUniqueConstraintError(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

// Which fields a unique-constraint violation hit. Prisma's error shape
// differs by driver: the classic query engine reports `meta.target`, while
// the `@prisma/adapter-pg` driver adapter (used here, see src/lib/db.ts)
// nests it under `meta.driverAdapterError.cause.constraint.fields` instead —
// check both so this doesn't silently misclassify the race under either.
function violatedFields(err: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = err.meta as
    | {
        target?: unknown;
        driverAdapterError?: {
          cause?: { constraint?: { fields?: unknown } };
        };
      }
    | undefined;

  const target = Array.isArray(meta?.target) ? meta.target : [];
  const driverFields = meta?.driverAdapterError?.cause?.constraint?.fields;

  return [...target, ...(Array.isArray(driverFields) ? driverFields : [])].map(
    (field) => String(field),
  );
}

function collidesOnSubject(err: Prisma.PrismaClientKnownRequestError): boolean {
  return violatedFields(err).some((field) =>
    field.toLowerCase().includes("subject"),
  );
}

function baseUsernameCandidate(claims: ExternalIdentityClaims): string {
  if (claims.preferredUsername?.trim()) return claims.preferredUsername.trim();
  const localPart = claims.email?.split("@")[0]?.trim();
  if (localPart) return localPart;
  return `authentik-${claims.subject.slice(0, 8)}`;
}

async function findAvailableUsername(base: string): Promise<string> {
  const existing = await db.operator.findUnique({ where: { username: base } });
  if (!existing) return base;

  for (let suffix = 1; suffix <= MAX_DETERMINISTIC_SUFFIX; suffix++) {
    const candidate = `${base}-${suffix}`;
    const taken = await db.operator.findUnique({
      where: { username: candidate },
    });
    if (!taken) return candidate;
  }

  // Pathological collision streak — fall back to a random suffix so
  // provisioning never blocks a login indefinitely.
  return `${base}-${randomBytes(4).toString("hex")}`;
}

async function findLinkedOperator(subject: string): Promise<{
  identityId: string;
  operator: Operator;
} | null> {
  const identity = await db.externalIdentity.findUnique({
    where: {
      provider_subject: { provider: ExternalIdentityProvider.AUTHENTIK, subject },
    },
    include: { operator: true },
  });
  if (!identity) return null;
  return { identityId: identity.id, operator: identity.operator };
}

export async function findOrCreateOperatorForExternalIdentity(
  claims: ExternalIdentityClaims,
): Promise<Operator> {
  const existing = await findLinkedOperator(claims.subject);
  if (existing) {
    await db.externalIdentity.update({
      where: { id: existing.identityId },
      data: { email: claims.email ?? null, lastLoginAt: new Date() },
    });
    return existing.operator;
  }

  const baseUsername = baseUsernameCandidate(claims);

  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    const username = await findAvailableUsername(baseUsername);
    try {
      return await db.$transaction(async (tx) => {
        const operator = await tx.operator.create({
          data: { username, passwordHash: null, email: claims.email ?? null },
        });
        await tx.externalIdentity.create({
          data: {
            provider: ExternalIdentityProvider.AUTHENTIK,
            subject: claims.subject,
            operatorId: operator.id,
            email: claims.email ?? null,
            lastLoginAt: new Date(),
          },
        });
        return operator;
      });
    } catch (err) {
      if (!isPrismaUniqueConstraintError(err)) throw err;

      if (collidesOnSubject(err)) {
        // Lost a race: a concurrent request just linked this exact
        // (provider, subject) — that row is the authoritative outcome.
        const winner = await findLinkedOperator(claims.subject);
        if (winner) return winner.operator;
        throw err;
      }

      // Otherwise a concurrent request just took the username we picked —
      // retry with a fresh candidate.
    }
  }

  throw new Error(
    `Unable to provision an Authentik-linked operator after ${MAX_USERNAME_ATTEMPTS} username collision retries`,
  );
}
