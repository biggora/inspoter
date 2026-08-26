import { createHash } from "node:crypto";

export const NOTE_CHUNK_TARGET_CHARS = 2_000;
export const NOTE_CHUNK_MAX_CHARS = 3_000;
export const NOTE_CHUNK_OVERLAP_CHARS = 300;

export interface MarkdownChunk {
  position: number;
  headingPath: string[];
  content: string;
  contentHash: string;
  embeddingInput: string;
}

interface Block {
  headingPath: string[];
  text: string;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function markdownBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings: string[] = [];
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) blocks.push({ headingPath: [...headings], text });
    buffer = [];
  };

  for (const line of lines) {
    const fence = /^\s*```/.test(line);
    if (!inFence) {
      const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (heading) {
        flush();
        const level = heading[1].length;
        headings.splice(level - 1);
        headings[level - 1] = heading[2].replace(/\s+#+\s*$/, "").trim();
        buffer.push(line);
        continue;
      }
      if (line.trim() === "") {
        flush();
        continue;
      }
    }
    buffer.push(line);
    if (fence) inFence = !inFence;
  }
  flush();
  return blocks;
}

function splitOversizedBlock(block: Block): Block[] {
  if (block.text.length <= NOTE_CHUNK_MAX_CHARS) return [block];
  const fenced = /^(\s*```[^\n]*\n)([\s\S]*)(\n```\s*)$/.exec(block.text);
  if (fenced) {
    const wrapperLength = fenced[1].length + fenced[3].length;
    const bodyLimit = Math.max(NOTE_CHUNK_MAX_CHARS - wrapperLength, 1);
    const pieces: Block[] = [];
    let remaining = fenced[2];
    while (remaining.length > bodyLimit) {
      let end = remaining.lastIndexOf("\n", bodyLimit);
      if (end < 1) end = bodyLimit;
      pieces.push({
        ...block,
        text: `${fenced[1]}${remaining.slice(0, end)}${fenced[3]}`,
      });
      remaining = remaining.slice(end).replace(/^\n/, "");
    }
    pieces.push({ ...block, text: `${fenced[1]}${remaining}${fenced[3]}` });
    return pieces;
  }

  const parts: Block[] = [];
  let offset = 0;
  while (offset < block.text.length) {
    let end = Math.min(offset + NOTE_CHUNK_MAX_CHARS, block.text.length);
    if (end < block.text.length) {
      const boundary = block.text.lastIndexOf("\n", end);
      if (boundary > offset + NOTE_CHUNK_TARGET_CHARS) end = boundary;
    }
    parts.push({ ...block, text: block.text.slice(offset, end).trim() });
    if (end >= block.text.length) break;
    offset = Math.max(end - NOTE_CHUNK_OVERLAP_CHARS, offset + 1);
  }
  return parts;
}

export function chunkMarkdown(
  title: string,
  markdown: string,
): MarkdownChunk[] {
  const source = markdownBlocks(markdown).flatMap(splitOversizedBlock);
  if (source.length === 0) source.push({ headingPath: [], text: "" });
  const grouped: Block[] = [];
  let current: Block | null = null;

  for (const block of source) {
    const combined: string = current
      ? `${current.text}\n\n${block.text}`
      : block.text;
    const sameHeading =
      current?.headingPath.join("\0") === block.headingPath.join("\0");
    if (current && sameHeading && combined.length <= NOTE_CHUNK_TARGET_CHARS) {
      current = { headingPath: current.headingPath, text: combined };
      grouped[grouped.length - 1] = current;
    } else {
      current = block;
      grouped.push(block);
    }
  }

  return grouped.map((block, position) => {
    const context = [title.trim(), ...block.headingPath].filter(Boolean);
    const embeddingInput = [...context, block.text].join("\n\n");
    return {
      position,
      headingPath: block.headingPath,
      content: block.text,
      contentHash: hash(embeddingInput),
      embeddingInput,
    };
  });
}

export interface RankedNote {
  noteId: string;
  score: number;
}

export function reciprocalRankFusion(
  rankings: readonly (readonly string[])[],
  k = 60,
): RankedNote[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((noteId, index) => {
      scores.set(noteId, (scores.get(noteId) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .map(([noteId, score]) => ({ noteId, score }))
    .sort(
      (left, right) =>
        right.score - left.score || left.noteId.localeCompare(right.noteId),
    );
}
