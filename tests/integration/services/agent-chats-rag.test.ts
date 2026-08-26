import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as agentsService from "@/lib/services/agents";
import * as runsService from "@/lib/services/agent-runs";
import * as notesService from "@/lib/services/notes";
import { enqueueNoteIndexJob } from "@/lib/services/note-index";

let workspaceId: string;
let otherWorkspaceId: string;
let agentId: string;

async function makeWorkspace(prefix: string): Promise<string> {
  return (
    await db.workspace.create({
      data: {
        name: "Agent chat RAG test",
        slug: `${prefix}-${randomUUID()}`,
      },
    })
  ).id;
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("chat-rag");
  otherWorkspaceId = await makeWorkspace("chat-rag-other");
});

afterAll(async () => {
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, otherWorkspaceId] } },
  });
});

beforeEach(async () => {
  await db.agentConversation.deleteMany({ where: { workspaceId } });
  await db.agent.deleteMany({ where: { workspaceId } });
  await db.note.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
  await db.workspaceEmbeddingProfile.deleteMany({
    where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
  });
  agentId = (
    await agentsService.createAgent(workspaceId, {
      name: `Chat agent ${randomUUID()}`,
      instructions: "Answer the operator.",
      scopes: ["notes:read"],
    })
  ).id;
});

describe("chat run persistence", () => {
  it("enforces one active turn and exempts chat history from retention", async () => {
    const conversation = await db.agentConversation.create({
      data: {
        workspaceId,
        agentId,
        agentWorkspaceId: workspaceId,
        title: "Persistent chat",
        createdByOperatorId: "operator-test",
        createdByOperatorName: "Operator",
      },
    });
    const first = await runsService.createRun(workspaceId, {
      agentId,
      trigger: "CHAT",
      idempotencyKey: `chat:${randomUUID()}`,
      input: "First",
      conversationId: conversation.id,
      conversationSequence: 1,
    });
    expect(first).not.toBeNull();
    const second = await runsService.createRun(workspaceId, {
      agentId,
      trigger: "CHAT",
      idempotencyKey: `chat:${randomUUID()}`,
      input: "Second",
      conversationId: conversation.id,
      conversationSequence: 2,
    });
    expect(second).toBeNull();

    await runsService.cancelRun(workspaceId, first!.id);
    await runsService.pruneOldRuns(new Date(Date.now() + 60_000));
    await expect(
      runsService.getRunDetail(workspaceId, first!.id),
    ).resolves.toMatchObject({ trigger: "CHAT", status: "CANCELLED" });
  });

  it("cascades runs and steps when the conversation is explicitly deleted", async () => {
    const conversation = await db.agentConversation.create({
      data: {
        workspaceId,
        agentId,
        agentWorkspaceId: workspaceId,
        title: "Disposable chat",
        createdByOperatorId: "operator-test",
        createdByOperatorName: "Operator",
      },
    });
    const run = await runsService.createRun(workspaceId, {
      agentId,
      trigger: "CHAT",
      idempotencyKey: `chat:${randomUUID()}`,
      conversationId: conversation.id,
      conversationSequence: 1,
      input: "Delete me",
    });
    await db.agentConversation.delete({ where: { id: conversation.id } });
    expect(await db.agentRun.findUnique({ where: { id: run!.id } })).toBeNull();
  });
});

describe("Notes hybrid storage", () => {
  it("has pgvector installed and supports exact scans for different dimensions", async () => {
    const extension = await db.$queryRaw<{ installed: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) AS installed
    `;
    expect(extension[0]?.installed).toBe(true);

    const first = await notesService.createNote(workspaceId, {
      title: "Three dimensions",
      content: "alpha",
    });
    const second = await notesService.createNote(otherWorkspaceId, {
      title: "Four dimensions",
      content: "beta",
    });
    await db.$executeRaw`
      INSERT INTO "NoteChunk" (
        "id", "workspaceId", "noteId", "noteWorkspaceId", "noteVersion",
        "position", "headingPath", "content", "contentHash",
        "profileRevision", "embedding", "createdAt"
      ) VALUES
        (${randomUUID()}, ${workspaceId}, ${first.id}, ${workspaceId}, 1, 0,
         ARRAY[]::TEXT[], 'alpha', 'hash-a', 1, '[1,0,0]'::vector, NOW()),
        (${randomUUID()}, ${otherWorkspaceId}, ${second.id}, ${otherWorkspaceId}, 1, 0,
         ARRAY[]::TEXT[], 'beta', 'hash-b', 1, '[1,0,0,0]'::vector, NOW())
    `;
    const rows = await db.$queryRaw<{ noteId: string }[]>`
      WITH scoped AS MATERIALIZED (
        SELECT "noteId", "embedding" FROM "NoteChunk"
        WHERE "workspaceId" = ${workspaceId} AND "profileRevision" = 1
      )
      SELECT "noteId" FROM scoped
      ORDER BY "embedding" <=> '[1,0,0]'::vector
    `;
    expect(rows.map((row) => row.noteId)).toEqual([first.id]);
  });

  it("finds Russian and English text with the simple FTS configuration", async () => {
    const note = await notesService.createNote(workspaceId, {
      title: "Recovery runbook",
      content: "Перезапуск сервиса после аварии",
    });
    const [russian, english] = await Promise.all([
      db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Note" WHERE "workspaceId" = ${workspaceId}
          AND "searchVector" @@ websearch_to_tsquery('simple', 'перезапуск')
      `,
      db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Note" WHERE "workspaceId" = ${workspaceId}
          AND "searchVector" @@ websearch_to_tsquery('simple', 'recovery')
      `,
    ]);
    expect(russian.map((row) => row.id)).toContain(note.id);
    expect(english.map((row) => row.id)).toContain(note.id);
  });

  it("enqueues one idempotent job and excludes stale note versions", async () => {
    await db.workspaceEmbeddingProfile.create({
      data: {
        workspaceId,
        model: "mock-embedding",
        dimensions: 3,
        revision: 1,
      },
    });
    const note = await notesService.createNote(workspaceId, {
      title: "Versioned",
      content: "old content",
    });
    await enqueueNoteIndexJob(workspaceId, note.id, note.version);
    expect(
      await db.noteIndexJob.count({
        where: { noteId: note.id, noteVersion: note.version },
      }),
    ).toBe(1);

    await db.$executeRaw`
      INSERT INTO "NoteChunk" (
        "id", "workspaceId", "noteId", "noteWorkspaceId", "noteVersion",
        "position", "headingPath", "content", "contentHash",
        "profileRevision", "embedding", "createdAt"
      ) VALUES (${randomUUID()}, ${workspaceId}, ${note.id}, ${workspaceId}, 1,
        0, ARRAY[]::TEXT[], 'old content', 'old-hash', 1, '[1,0,0]'::vector, NOW())
    `;
    await notesService.updateNote(workspaceId, note.id, {
      version: 1,
      content: "new content",
    });
    const current = await db.$queryRaw<{ content: string }[]>`
      SELECT c."content" FROM "NoteChunk" c
      INNER JOIN "Note" n ON n."id" = c."noteId" AND n."workspaceId" = c."workspaceId"
      WHERE c."noteId" = ${note.id} AND c."noteVersion" = n."version"
    `;
    expect(current).toEqual([]);
  });
});
