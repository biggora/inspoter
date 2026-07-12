import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Operator } from "@/generated/prisma/client";
import { getValidSession, readSessionCookie } from "@/lib/auth/session";

// Auth Data Access Layer (architecture.md §5.3, ADR-012) — the authoritative
// auth gate (as opposed to middleware.ts's optimistic cookie-presence check).
// Validates the `session` cookie against the DB (exists + not expired) and
// returns the associated Operator, or redirects to /login. Called by
// `(dashboard)/layout.tsx` and every non-webhook API route handler
// (NFR-SEC-001). The sole sanctioned Prisma caller outside the service layer.

export async function requireOperator(): Promise<Operator> {
  const sessionId = await readSessionCookie();
  if (!sessionId) redirect("/login");

  const session = await getValidSession(sessionId);
  if (!session) redirect("/login");

  const operator = await db.operator.findUnique({ where: { id: session.operatorId } });
  if (!operator) redirect("/login");

  return operator;
}

// Code-review fix (Slice 1, minor #2, ADR-012): the login Server Action
// (src/app/login/actions.ts) must not call Prisma directly. This lookup
// lives alongside requireOperator() as the DAL is the sole sanctioned
// Prisma caller outside the service layer.
export async function findOperatorByUsername(username: string): Promise<Operator | null> {
  return db.operator.findUnique({ where: { username } });
}
