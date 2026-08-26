import { randomUUID } from "node:crypto";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { chunkMarkdown } from "@/lib/notes/rag";
import * as llmService from "@/lib/services/llm";

const JOB_LEASE_MS = 120_000;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000];

export class EmbeddingProfileConfigurationError extends Error {
  readonly code = "EMBEDDING_PROFILE_INVALID";
}

function describeEmbeddingFailure(
  result: Exclude<
    Awaited<ReturnType<typeof llmService.embedForRag>>,
    { ok: true }
  >,
): string {
  return result.kind === "unsupported"
    ? "The selected credential does not support embeddings."
    : `${result.category}: ${result.message}`;
}

export async function configureEmbeddingProfile(
  workspaceId: string,
  credentialId: string,
  model: string,
  caller: llmService.LlmCaller,
) {
  const trimmedModel = model.trim();
  if (!trimmedModel) {
    throw new EmbeddingProfileConfigurationError(
      "Embedding model is required.",
    );
  }
  const probe = await llmService.probeEmbeddingProvider(
    workspaceId,
    credentialId,
    trimmedModel,
    caller,
  );
  if (!probe.ok || probe.data.vectors.length !== 1) {
    throw new EmbeddingProfileConfigurationError(
      probe.ok
        ? "Embedding probe returned no vector."
        : describeEmbeddingFailure(probe),
    );
  }
  const dimensions = probe.data.vectors[0]?.length ?? 0;
  if (dimensions <= 0) {
    throw new EmbeddingProfileConfigurationError(
      "Embedding probe returned an empty vector.",
    );
  }

  const profile = await db.$transaction(async (tx) => {
    const existing = await tx.workspaceEmbeddingProfile.findUnique({
      where: { workspaceId },
      select: { revision: true },
    });
    const revision = (existing?.revision ?? 0) + 1;
    const totalNotes = await tx.note.count({ where: { workspaceId } });
    return tx.workspaceEmbeddingProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        credentialId,
        credentialWorkspaceId: workspaceId,
        model: trimmedModel,
        dimensions,
        revision,
        totalNotes,
        indexedNotes: 0,
        backfillStatus: totalNotes === 0 ? "READY" : "PENDING",
      },
      update: {
        credentialId,
        credentialWorkspaceId: workspaceId,
        model: trimmedModel,
        dimensions,
        revision,
        totalNotes,
        indexedNotes: 0,
        backfillStatus: totalNotes === 0 ? "READY" : "PENDING",
        lastError: null,
        lastErrorAt: null,
      },
    });
  });
  await enqueueWorkspaceBackfill(workspaceId, profile.revision);
  return getEmbeddingStatus(workspaceId);
}

export async function clearEmbeddingProfile(
  workspaceId: string,
): Promise<void> {
  await db.$transaction([
    db.noteChunk.deleteMany({ where: { workspaceId } }),
    db.workspaceEmbeddingProfile.deleteMany({ where: { workspaceId } }),
  ]);
}

export async function getEmbeddingStatus(workspaceId: string) {
  return db.workspaceEmbeddingProfile.findUnique({
    where: { workspaceId },
    select: {
      credentialId: true,
      model: true,
      dimensions: true,
      revision: true,
      backfillStatus: true,
      indexedNotes: true,
      totalNotes: true,
      lastError: true,
      lastErrorAt: true,
      updatedAt: true,
    },
  });
}

export async function enqueueWorkspaceBackfill(
  workspaceId: string,
  revision: number,
): Promise<void> {
  const notes = await db.note.findMany({
    where: { workspaceId },
    select: { id: true, version: true },
  });
  if (notes.length === 0) return;
  await db.noteIndexJob.createMany({
    data: notes.map((note) => ({
      workspaceId,
      profileWorkspaceId: workspaceId,
      noteId: note.id,
      noteWorkspaceId: workspaceId,
      noteVersion: note.version,
      profileRevision: revision,
    })),
    skipDuplicates: true,
  });
}

export async function enqueueNoteIndexJob(
  workspaceId: string,
  noteId: string,
  noteVersion: number,
): Promise<void> {
  const profile = await db.workspaceEmbeddingProfile.findUnique({
    where: { workspaceId },
    select: { revision: true },
  });
  if (!profile) return;
  await db.noteIndexJob.createMany({
    data: [
      {
        workspaceId,
        profileWorkspaceId: workspaceId,
        noteId,
        noteWorkspaceId: workspaceId,
        noteVersion,
        profileRevision: profile.revision,
      },
    ],
    skipDuplicates: true,
  });
  await db.workspaceEmbeddingProfile.update({
    where: { workspaceId },
    data: {
      totalNotes: await db.note.count({ where: { workspaceId } }),
      backfillStatus: "PENDING",
    },
  });
}

export interface ClaimedNoteIndexJob {
  id: string;
  workspaceId: string;
  leaseToken: string;
}

export async function reclaimStaleNoteIndexJobs(
  now = new Date(),
): Promise<void> {
  await db.noteIndexJob.updateMany({
    where: { status: "RUNNING", leaseExpiresAt: { lte: now } },
    data: {
      status: "PENDING",
      leaseToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: now,
    },
  });
}

export async function claimNoteIndexJobs(
  limit = env.NOTE_INDEX_JOB_BATCH,
  now = new Date(),
): Promise<ClaimedNoteIndexJob[]> {
  const candidates = await db.noteIndexJob.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    select: { id: true, workspaceId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit * 2,
  });
  const claimed: ClaimedNoteIndexJob[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    const leaseToken = randomUUID();
    const result = await db.noteIndexJob.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: {
        status: "RUNNING",
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
      },
    });
    if (result.count === 1) claimed.push({ ...candidate, leaseToken });
  }
  return claimed;
}

function vectorLiteral(vector: readonly number[]): string {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned an invalid vector.");
  }
  return `[${vector.join(",")}]`;
}

async function refreshProfileProgress(
  workspaceId: string,
  revision: number,
): Promise<void> {
  const [profile, totalNotes, indexed] = await Promise.all([
    db.workspaceEmbeddingProfile.findUnique({
      where: { workspaceId },
      select: { revision: true },
    }),
    db.note.count({ where: { workspaceId } }),
    db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT c."noteId") AS count
      FROM "NoteChunk" c
      INNER JOIN "Note" n
        ON n."id" = c."noteId" AND n."workspaceId" = c."workspaceId"
      WHERE c."workspaceId" = ${workspaceId}
        AND c."profileRevision" = ${revision}
        AND c."noteVersion" = n."version"
    `,
  ]);
  if (!profile || profile.revision !== revision) return;
  const indexedNotes = Number(indexed[0]?.count ?? 0n);
  const [unfinished, failed] = await Promise.all([
    db.noteIndexJob.count({
      where: {
        workspaceId,
        profileRevision: revision,
        status: { in: ["PENDING", "RUNNING"] },
      },
    }),
    db.noteIndexJob.count({
      where: { workspaceId, profileRevision: revision, status: "FAILED" },
    }),
  ]);
  const ready = unfinished === 0 && indexedNotes >= totalNotes;
  await db.workspaceEmbeddingProfile.update({
    where: { workspaceId },
    data: {
      indexedNotes,
      totalNotes,
      backfillStatus: ready ? "READY" : failed > 0 ? "ERROR" : "RUNNING",
      ...(ready ? { lastError: null, lastErrorAt: null } : {}),
    },
  });
  if (ready) {
    await db.noteChunk.deleteMany({
      where: { workspaceId, profileRevision: { not: revision } },
    });
  }
}

export async function processNoteIndexJob(
  claim: ClaimedNoteIndexJob,
): Promise<void> {
  const job = await db.noteIndexJob.findFirst({
    where: {
      id: claim.id,
      workspaceId: claim.workspaceId,
      status: "RUNNING",
      leaseToken: claim.leaseToken,
    },
    include: {
      note: { select: { id: true, title: true, content: true, version: true } },
      profile: {
        select: { revision: true, dimensions: true },
      },
    },
  });
  if (!job) return;
  if (
    job.note.version !== job.noteVersion ||
    job.profile.revision !== job.profileRevision
  ) {
    await db.noteIndexJob.updateMany({
      where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    return;
  }

  try {
    const chunks = chunkMarkdown(job.note.title, job.note.content);
    const result = await llmService.embedForRag(
      claim.workspaceId,
      { operatorId: "scheduler:note-index", operatorName: "Note indexer" },
      "index",
      { input: chunks.map((chunk) => chunk.embeddingInput) },
    );
    if (!result.ok) throw new Error(describeEmbeddingFailure(result));
    if (
      result.data.vectors.length !== chunks.length ||
      result.data.vectors.some(
        (vector) => vector.length !== job.profile.dimensions,
      )
    ) {
      throw new Error("Embedding dimensions changed during indexing.");
    }

    await db.$transaction(async (tx) => {
      await tx.noteChunk.deleteMany({
        where: {
          noteId: job.noteId,
          noteVersion: job.noteVersion,
          profileRevision: job.profileRevision,
        },
      });
      for (const [index, chunk] of chunks.entries()) {
        const vector = vectorLiteral(result.data.vectors[index]);
        await tx.$executeRaw`
          INSERT INTO "NoteChunk" (
            "id", "workspaceId", "noteId", "noteWorkspaceId", "noteVersion",
            "position", "headingPath", "content", "contentHash",
            "profileRevision", "embedding", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${claim.workspaceId}, ${job.noteId}, ${claim.workspaceId},
            ${job.noteVersion}, ${chunk.position}, ${chunk.headingPath},
            ${chunk.content}, ${chunk.contentHash}, ${job.profileRevision},
            ${vector}::vector, NOW()
          )
        `;
      }
      await tx.noteIndexJob.updateMany({
        where: {
          id: claim.id,
          status: "RUNNING",
          leaseToken: claim.leaseToken,
        },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
    });
    await refreshProfileProgress(claim.workspaceId, job.profileRevision);
  } catch (error) {
    const attempts = job.attempts + 1;
    const exhausted = attempts >= job.maxAttempts;
    const message = error instanceof Error ? error.message : String(error);
    await db.noteIndexJob.updateMany({
      where: { id: claim.id, status: "RUNNING", leaseToken: claim.leaseToken },
      data: {
        attempts,
        status: exhausted ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(
          Date.now() +
            (RETRY_DELAYS_MS[
              Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)
            ] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]),
        ),
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: message.slice(0, 1_000),
        ...(exhausted ? { completedAt: new Date() } : {}),
      },
    });
    await db.workspaceEmbeddingProfile.updateMany({
      where: { workspaceId: claim.workspaceId, revision: job.profileRevision },
      data: {
        backfillStatus: exhausted ? "ERROR" : "RUNNING",
        lastError: message.slice(0, 1_000),
        lastErrorAt: new Date(),
      },
    });
  }
}
