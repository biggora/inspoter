import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthWithWorkspaceParam: vi.fn(),
  computeIndicatorState: vi.fn(),
  subscribeToIndicatorSnapshots: vi.fn(),
}));

// Spread the real module: toErrorResponse maps the WorkspaceContext* classes
// by identity, so stubbing them away would break the refusal path.
vi.mock("@/lib/auth/dal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/dal")>()),
  requireAuthWithWorkspaceParam: mocks.requireAuthWithWorkspaceParam,
}));
vi.mock("@/lib/services/indicator-counts", () => ({
  computeIndicatorState: mocks.computeIndicatorState,
}));
vi.mock("@/lib/services/indicator-broadcaster", () => ({
  subscribeToIndicatorSnapshots: mocks.subscribeToIndicatorSnapshots,
}));

import { NextRequest } from "next/server";
import { WorkspaceContextStaleError } from "@/lib/auth/dal";
import { GET } from "@/app/api/indicators/stream/route";

const WORKSPACE = "workspace-a";
const STATE = {
  mail: 2,
  alerts: 0,
  messages: 0,
  calendar: 0,
  providersOk: 4,
  providersErrored: 0,
  openCriticalAlerts: 0,
};

let unsubscribe: ReturnType<typeof vi.fn>;
let push: ((state: unknown) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  unsubscribe = vi.fn();
  push = null;
  mocks.requireAuthWithWorkspaceParam.mockResolvedValue({
    operator: { id: "op" },
    workspace: { id: WORKSPACE },
  });
  mocks.computeIndicatorState.mockResolvedValue(STATE);
  mocks.subscribeToIndicatorSnapshots.mockImplementation(
    (_workspaceId: string, listener: (state: unknown) => void) => {
      push = listener;
      return unsubscribe;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function request() {
  return new NextRequest(
    `http://localhost/api/indicators/stream?workspace=${WORKSPACE}`,
  );
}

/** Read exactly one chunk we know is coming. */
async function readOne(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const result = await reader.read();
  return result.done ? "" : new TextDecoder().decode(result.value);
}

// The opening writes exactly two chunks: the reconnect hint, then the first
// state frame. Reading a fixed count matters — a racing read() is not
// cancelled when it loses, and the dangling promise would swallow the next
// chunk the test is waiting for.
const OPENING_CHUNKS = 2;

async function readOpening(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  let out = "";
  for (let i = 0; i < OPENING_CHUNKS; i += 1) out += await readOne(reader);
  return out;
}

describe("GET /api/indicators/stream", () => {
  it("responds with the SSE headers a reverse proxy needs", async () => {
    const response = await GET(request());

    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    // Without this nginx buffers the stream into silence.
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");

    await response.body!.cancel();
  });

  it("opens with a reconnect hint and the current state", async () => {
    const response = await GET(request());
    const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(0);

    const opening = await readOpening(reader);

    expect(opening).toContain("retry: 5000");
    expect(opening).toContain("event: state");
    expect(opening).toContain(JSON.stringify(STATE));

    await reader.cancel();
  });

  it("forwards a broadcast as a state frame", async () => {
    const response = await GET(request());
    const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(0);
    await readOpening(reader);

    push!({ ...STATE, mail: 9 });
    const frame = await readOne(reader);

    expect(frame).toContain(`data: ${JSON.stringify({ ...STATE, mail: 9 })}`);

    await reader.cancel();
  });

  it("emits a heartbeat so an idle stream is not dropped", async () => {
    const response = await GET(request());
    const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(0);
    await readOpening(reader);

    await vi.advanceTimersByTimeAsync(25_000);
    const beat = await readOne(reader);

    expect(beat).toContain(": ping");

    await reader.cancel();
  });

  // The leak: without this the interval and the broadcaster subscription keep
  // querying the database for a browser tab that has gone.
  it("unsubscribes and clears its timer when the client goes away", async () => {
    const response = await GET(request());
    const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(0);
    await readOpening(reader);

    await reader.cancel();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tears down on request abort too", async () => {
    const controller = new AbortController();
    const aborting = new NextRequest(
      `http://localhost/api/indicators/stream?workspace=${WORKSPACE}`,
      { signal: controller.signal },
    );
    const response = await GET(aborting);
    const reader = response.body!.getReader();
    await vi.advanceTimersByTimeAsync(0);
    await readOpening(reader);

    controller.abort();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  // EventSource cannot read a status code, which is why the client fetches
  // before it connects; the route must still refuse rather than stream to a
  // tab pointed at a workspace the session has left.
  it("refuses a stale workspace instead of streaming to it", async () => {
    mocks.requireAuthWithWorkspaceParam.mockRejectedValue(
      new WorkspaceContextStaleError(),
    );

    const response = await GET(request());

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.subscribeToIndicatorSnapshots).not.toHaveBeenCalled();
  });
});
