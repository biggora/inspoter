import type { NextRequest } from "next/server";

// Reads the request body while enforcing a byte cap, checking Content-Length up
// front and also capping the actual stream read so a lying/absent header can't
// bypass the limit (architecture.md §3.6). Shared by every ingest pipeline —
// the legacy typed one, the channel one, and the Discord-compatible one.
export async function readBodyLimited(
  request: NextRequest,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: "" };

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }

  return { ok: true, text: Buffer.concat(chunks).toString("utf-8") };
}
