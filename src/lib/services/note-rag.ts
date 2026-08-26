import { env } from "@/lib/config/env";
import { db } from "@/lib/db";
import { reciprocalRankFusion } from "@/lib/notes/rag";
import * as llmService from "@/lib/services/llm";

export type RagMode =
  | "HYBRID"
  | "FTS_ONLY_NO_PROFILE"
  | "FTS_ONLY_INDEXING"
  | "FTS_ONLY_EMBEDDING_ERROR";

export interface RagSourceSnapshot {
  noteId: string;
  title: string;
  headingPath: string[];
  content: string;
  score: number;
}

export interface RagRetrievalResult {
  mode: RagMode;
  sources: RagSourceSnapshot[];
  context: string;
}

interface FtsRow {
  noteId: string;
  title: string;
  content: string;
  rank: number;
}

interface VectorRow {
  noteId: string;
  title: string;
  headingPath: string[];
  content: string;
  distance: number;
}

function vectorLiteral(vector: readonly number[]): string {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding provider returned an invalid query vector.");
  }
  return `[${vector.join(",")}]`;
}

async function fullTextSearch(
  workspaceId: string,
  query: string,
): Promise<FtsRow[]> {
  return db.$queryRaw<FtsRow[]>`
    WITH q AS (SELECT websearch_to_tsquery('simple', ${query}) AS query)
    SELECT
      n."id" AS "noteId",
      n."title",
      ts_headline(
        'simple', n."content", q.query,
        'StartSel=,StopSel=,MaxFragments=3,MaxWords=80,MinWords=20'
      ) AS "content",
      ts_rank_cd(n."searchVector", q.query)::double precision AS rank
    FROM "Note" n, q
    WHERE n."workspaceId" = ${workspaceId}
      AND n."searchVector" @@ q.query
    ORDER BY rank DESC, n."updatedAt" DESC, n."id" ASC
    LIMIT 20
  `;
}

async function vectorSearch(
  workspaceId: string,
  revision: number,
  vector: readonly number[],
): Promise<VectorRow[]> {
  const literal = vectorLiteral(vector);
  return db.$queryRaw<VectorRow[]>`
    WITH current_chunks AS MATERIALIZED (
      SELECT c."noteId", c."headingPath", c."content", c."embedding"
      FROM "NoteChunk" c
      INNER JOIN "Note" n
        ON n."id" = c."noteId" AND n."workspaceId" = c."workspaceId"
      WHERE c."workspaceId" = ${workspaceId}
        AND c."profileRevision" = ${revision}
        AND c."noteVersion" = n."version"
        AND c."embedding" IS NOT NULL
    )
    SELECT
      c."noteId",
      n."title",
      c."headingPath",
      c."content",
      (c."embedding" <=> ${literal}::vector)::double precision AS distance
    FROM current_chunks c
    INNER JOIN "Note" n ON n."id" = c."noteId" AND n."workspaceId" = ${workspaceId}
    ORDER BY c."embedding" <=> ${literal}::vector, c."noteId"
    LIMIT 20
  `;
}

function buildSources(
  fts: readonly FtsRow[],
  semantic: readonly VectorRow[],
): RagSourceSnapshot[] {
  const semanticNoteIds = [...new Set(semantic.map((row) => row.noteId))];
  const rankings = [fts.map((row) => row.noteId), semanticNoteIds];
  const fused = reciprocalRankFusion(rankings);
  const bestSemantic = new Map<string, VectorRow>();
  for (const row of semantic) {
    if (!bestSemantic.has(row.noteId)) bestSemantic.set(row.noteId, row);
  }
  const ftsByNote = new Map(fts.map((row) => [row.noteId, row]));

  const sources: RagSourceSnapshot[] = [];
  let used = 0;
  for (const ranked of fused) {
    if (sources.length >= 6) break;
    const vectorRow = bestSemantic.get(ranked.noteId);
    const ftsRow = ftsByNote.get(ranked.noteId);
    const row = vectorRow ?? ftsRow;
    if (!row) continue;
    const content = row.content.slice(0, env.AGENT_RAG_CONTEXT_MAX_CHARS);
    if (used + content.length > env.AGENT_RAG_CONTEXT_MAX_CHARS) {
      const remaining = env.AGENT_RAG_CONTEXT_MAX_CHARS - used;
      if (remaining < 200) continue;
      sources.push({
        noteId: row.noteId,
        title: row.title,
        headingPath: vectorRow?.headingPath ?? [],
        content: content.slice(0, remaining),
        score: ranked.score,
      });
      break;
    }
    sources.push({
      noteId: row.noteId,
      title: row.title,
      headingPath: vectorRow?.headingPath ?? [],
      content,
      score: ranked.score,
    });
    used += content.length;
  }
  return sources;
}

function contextFromSources(sources: readonly RagSourceSnapshot[]): string {
  return sources
    .map((source, index) =>
      [
        `<<<RAG_CONTEXT source=${index + 1} noteId=${source.noteId} title=${JSON.stringify(source.title)}>>>`,
        source.headingPath.length > 0
          ? `Heading: ${source.headingPath.join(" > ")}`
          : null,
        source.content,
        "RAG_CONTEXT>>>",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    )
    .join("\n\n");
}

export async function retrieveNoteContext(
  workspaceId: string,
  query: string,
  runId: string,
): Promise<RagRetrievalResult> {
  const fts = await fullTextSearch(workspaceId, query);
  const profile = await db.workspaceEmbeddingProfile.findUnique({
    where: { workspaceId },
    select: {
      revision: true,
      dimensions: true,
      backfillStatus: true,
      credentialId: true,
    },
  });

  let mode: RagMode = "FTS_ONLY_NO_PROFILE";
  let semantic: VectorRow[] = [];
  if (profile?.credentialId && profile.backfillStatus === "READY") {
    try {
      const embedding = await llmService.embedForRag(
        workspaceId,
        { operatorId: `agent:${runId}`, operatorName: "Agent RAG" },
        "query",
        { input: [query] },
      );
      if (
        embedding.ok &&
        embedding.data.vectors[0]?.length === profile.dimensions
      ) {
        semantic = await vectorSearch(
          workspaceId,
          profile.revision,
          embedding.data.vectors[0],
        );
        mode = "HYBRID";
      } else {
        mode = "FTS_ONLY_EMBEDDING_ERROR";
      }
    } catch {
      mode = "FTS_ONLY_EMBEDDING_ERROR";
    }
  } else if (profile?.credentialId) {
    mode = "FTS_ONLY_INDEXING";
  }

  const sources = buildSources(fts, semantic);
  return { mode, sources, context: contextFromSources(sources) };
}
