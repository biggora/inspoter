import type { z } from "zod";
import type { LlmResult } from "@/lib/llm/contract";

// Parsing a JSON answer out of a model reply. This lives in src/lib/llm
// rather than in the feature that asked for it because "the model wrapped the
// object in prose or in a fenced block" is a property of models, not of mail.
//
// The format is never guaranteed by the transport: responseFormat is a hint
// that OpenAI-compatible endpoints honour unevenly and the Anthropic Messages
// API lacks entirely (see the prefill note in anthropic.ts). So every answer
// goes through the defensive extraction below before it is validated.

const FENCE = /```(?:json)?\s*([\s\S]*?)\s*```/i;

// How many opening braces to try before giving up. A clean answer needs one
// attempt and a preamble-plus-object answer needs two; the cap exists so a
// pathological reply full of braces cannot turn extraction into an O(n)
// parse loop.
const MAX_START_CANDIDATES = 8;

// Returns the JSON object embedded in `text`, or null when none of the
// candidates parse. Candidate starts are tried left to right against the last
// closing brace, which is what lets a stray leading brace (an assistant
// prefill the upstream ignored) or a short preamble be skipped rather than
// swallowed into an unparseable slice.
export function extractJsonObject(text: string): string | null {
  const fenced = FENCE.exec(text);
  const candidate = fenced ? fenced[1] : text;

  const end = candidate.lastIndexOf("}");
  if (end === -1) return null;

  let start = candidate.indexOf("{");
  for (let attempt = 0; start !== -1 && start < end; attempt += 1) {
    if (attempt >= MAX_START_CANDIDATES) return null;
    const slice = candidate.slice(start, end + 1);
    try {
      const parsed: unknown = JSON.parse(slice);
      // An array or a scalar is not what any caller here asked for, and
      // accepting one would only push the failure into the schema.
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return slice;
      }
    } catch {
      // Not this start brace — try the next one.
    }
    start = candidate.indexOf("{", start + 1);
  }

  return null;
}

// IMPORTANT, and different from every other driver in this directory:
// the failure message carries the schema paths that did not match and NOTHING
// of what the model wrote. openai.ts truncates an upstream body into its error
// on purpose, because that body is a gateway message. Here the "upstream body"
// is a restatement of the operator's own mail, and its place is neither in a
// LogEntry nor in an API response. Do not "fix" this back into a snippet.
export function parseJsonAnswer<T>(
  text: string,
  schema: z.ZodType<T>,
): LlmResult<T> {
  const extracted = extractJsonObject(text);
  if (extracted === null) {
    // Braces present but nothing parseable is a different failure from an
    // answer that never attempted JSON at all, and the two point at different
    // fixes (a truncated reply vs. a prompt the model ignored).
    return {
      ok: false,
      kind: "error",
      category: "invalid_response",
      message:
        text.includes("{") && text.includes("}")
          ? "Model returned malformed JSON"
          : "Model returned no JSON object",
    };
  }

  // Guaranteed to succeed: extractJsonObject only returns slices it parsed.
  const parsed: unknown = JSON.parse(extracted);

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const paths = result.error.issues
      .map((issue) => issue.path.join(".") || "(root)")
      .join(", ");
    return {
      ok: false,
      kind: "error",
      category: "invalid_response",
      message: `Model returned JSON that does not match the expected shape (${paths})`,
    };
  }

  return { ok: true, data: result.data };
}
