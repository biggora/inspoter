import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceParam } from "@/lib/auth/dal";
import { computeIndicatorState } from "@/lib/services/indicator-counts";
import { subscribeToIndicatorSnapshots } from "@/lib/services/indicator-broadcaster";
import { toErrorResponse } from "@/lib/api/errors";

// Server-Sent Events feed for the dashboard indicators. This is what lets the
// twelve in-process schedulers (src/instrumentation.ts) move a badge without
// the operator touching anything — a reminder falling due, a provider sync
// failing, mail arriving.
//
// Deliberately NOT routed through jsonResponse(): that helper stamps a `Vary`
// header meaningless on this request, and NextResponse.json cannot carry a
// stream at all.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Chosen against nginx's 60s proxy_read_timeout default: a comment line often
// enough that an idle stream never looks dead to a reverse proxy.
const HEARTBEAT_MS = 25_000;

// Handed to the browser as the reconnect backoff. EventSource reconnects on its
// own; the server replies with a full snapshot on every new connection, so a
// dropped stream self-heals without any client bookkeeping.
const RETRY_MS = 5_000;

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceParam(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const encoder = new TextEncoder();

  // Hoisted out of start() so cancel() — the path the runtime takes when the
  // response is discarded — tears down the same resources.
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let close: (() => void) | null = null;

  // Idempotent, and reachable from all four teardown paths (abort, cancel, a
  // failed write, an early return). Each happens in practice depending on how
  // the client went away; missing any single one leaks an interval plus a
  // broadcaster subscription that keeps querying the database for a closed tab.
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
    close?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      close = () => {
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to do.
        }
      };

      // A write to a stream whose client has gone is the reliable way to
      // notice the disconnect, so every enqueue funnels through here.
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const send = (state: unknown) => {
        write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      };

      write(`retry: ${RETRY_MS}\n\n`);

      // Correct on connect, and again on every reconnect — the client never
      // has to replay anything it missed while disconnected.
      try {
        send(await computeIndicatorState(workspace.id));
      } catch {
        // The client already has the server-rendered seed and its safety poll;
        // an opening snapshot that failed is not worth refusing the stream.
      }
      if (closed) return;

      unsubscribe = subscribeToIndicatorSnapshots(workspace.id, send);
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      heartbeat.unref?.();

      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      // Without this nginx buffers the stream into silence.
      "X-Accel-Buffering": "no",
    },
  });
}
