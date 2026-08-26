import { describe, expect, it } from "vitest";
import {
  chunkMarkdown,
  NOTE_CHUNK_MAX_CHARS,
  reciprocalRankFusion,
} from "@/lib/notes/rag";

describe("Notes RAG primitives", () => {
  it("keeps heading paths and produces stable hashes", () => {
    const markdown =
      "# Runbook\n\nIntro\n\n## Recovery\n\nRestart the service.";
    const first = chunkMarkdown("Operations", markdown);
    const second = chunkMarkdown("Operations", markdown);

    expect(first.map((chunk) => chunk.contentHash)).toEqual(
      second.map((chunk) => chunk.contentHash),
    );
    expect(first.some((chunk) => chunk.headingPath.includes("Recovery"))).toBe(
      true,
    );
    expect(
      first.every((chunk) => chunk.embeddingInput.startsWith("Operations")),
    ).toBe(true);
  });

  it("never emits an open fenced code block and respects the hard cap", () => {
    const code = `\`\`\`ts\n${"const value = 1;\n".repeat(400)}\`\`\``;
    const chunks = chunkMarkdown("Code", code);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(NOTE_CHUNK_MAX_CHARS);
      expect((chunk.content.match(/```/g) ?? []).length % 2).toBe(0);
    }
  });

  it("fuses independent rankings at note level", () => {
    const fused = reciprocalRankFusion([
      ["fts-first", "shared"],
      ["vector-first", "shared"],
    ]);

    expect(fused[0]).toMatchObject({ noteId: "shared" });
    expect(fused).toHaveLength(3);
  });
});
