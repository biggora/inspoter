import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// Legacy-link resolver (docs/plans/workspace-in-url.md §4.5, AC-WS-014 step 1):
// for a single-entity deep link without a `/w/<slug>` prefix, the slug of the
// workspace that owns the entity, provided the operator is a member of it.
//
// Existence is never disclosed: an unknown id and an entity in a workspace the
// operator does not belong to both run the same single query (membership is a
// condition of it, not a second lookup) and both answer null.

// The shapes an entity id can have: Prisma's `@default(cuid())` ("c" and 24
// base-36 characters) for rows created in the app, and a canonical lowercase
// UUID for the contacts, dashboards, kanban boards and services a backup import
// re-creates with `crypto.randomUUID()` (backup.ts). Anything else cannot be an
// id, so no query is run for it.
const ENTITY_ID =
  /^(?:c[0-9a-z]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

type Owner = Promise<{ workspace: { slug: string } } | null>;
type Lookup = (id: string, where: Prisma.WorkspaceWhereInput) => Owner;

const workspaceSlug = { workspace: { select: { slug: true } } } as const;

const LOOKUPS = {
  notes: (id, workspace) =>
    db.note.findFirst({ where: { id, workspace }, select: workspaceSlug }),
  kanban: (id, workspace) =>
    db.kanbanBoard.findFirst({
      where: { id, workspace },
      select: workspaceSlug,
    }),
  contacts: (id, workspace) =>
    db.contact.findFirst({ where: { id, workspace }, select: workspaceSlug }),
  services: (id, workspace) =>
    db.service.findFirst({ where: { id, workspace }, select: workspaceSlug }),
  servers: (id, workspace) =>
    db.localServer.findFirst({
      where: { id, workspace },
      select: workspaceSlug,
    }),
  agents: (id, workspace) =>
    db.agent.findFirst({ where: { id, workspace }, select: workspaceSlug }),
  "agents/runs": (id, workspace) =>
    db.agentRun.findFirst({ where: { id, workspace }, select: workspaceSlug }),
  "agents/chats": (id, workspace) =>
    db.agentConversation.findFirst({
      where: { id, workspace },
      select: workspaceSlug,
    }),
  dashboards: (id, workspace) =>
    db.dashboard.findFirst({ where: { id, workspace }, select: workspaceSlug }),
} satisfies Record<string, Lookup>;

type DeepLinkKind = keyof typeof LOOKUPS;

// The kind and id of a legacy path that is exactly one of the nine deep-link
// forms, otherwise null. `/agents/runs/<id>` is matched on its own two-segment
// prefix, so `/agents/<id>` never swallows `runs` or `chats`. The segments are
// still percent-encoded, which no id is, so an encoded id never matches.
function parseDeepLink(
  section: string,
  rest: string[],
): { kind: DeepLinkKind; id: string } | null {
  let kind: string;
  let id: string | undefined;
  if (section === "agents" && rest.length === 2) {
    kind = `agents/${rest[0]}`;
    id = rest[1];
  } else if (rest.length === 1) {
    kind = section;
    id = rest[0];
  } else {
    return null;
  }
  if (!Object.hasOwn(LOOKUPS, kind) || !id || !ENTITY_ID.test(id)) return null;
  return { kind: kind as DeepLinkKind, id };
}

/**
 * The slug of the workspace owning the entity a legacy deep link points at, or
 * null when the path is not a deep link, the id is malformed (no query is run),
 * the entity does not exist, or the operator is not a member of its workspace.
 */
export async function resolveDeepLinkWorkspaceSlug(
  operatorId: string,
  section: string,
  rest: string[],
): Promise<string | null> {
  const link = parseDeepLink(section, rest);
  if (!link) return null;
  const owner = await LOOKUPS[link.kind](link.id, {
    members: { some: { operatorId } },
  });
  return owner?.workspace.slug ?? null;
}
