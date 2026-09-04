import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Everything between a domain service and the browser, wired for real: only
// auth and Prisma are stubbed. The other stream test mocks the broadcaster to
// isolate the route; this one proves the chain those pieces form —
// publishIndicatorChange -> event bus -> broadcaster coalescing -> SSE frame.

const mocks = vi.hoisted(() => ({
  requireAuthWithWorkspaceParam: vi.fn(),
  alertCount: vi.fn(),
  messageCount: vi.fn(),
  mailItemCount: vi.fn(),
  mailFolderFindMany: vi.fn(),
  reminderOccurrenceCount: vi.fn(),
  providerCredentialCount: vi.fn(),
}));

vi.mock("@/lib/auth/dal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/dal")>()),
  requireAuthWithWorkspaceParam: mocks.requireAuthWithWorkspaceParam,
}));

vi.mock("@/lib/db", () => ({
  db: {
    mailFolder: { findMany: mocks.mailFolderFindMany },
    mailItem: { count: mocks.mailItemCount },
    alert: { count: mocks.alertCount },
    message: { count: mocks.messageCount },
    reminderOccurrence: { count: mocks.reminderOccurrenceCount },
    providerCredential: { count: mocks.providerCredentialCount },
  },
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/indicators/stream/route";
import {
  __resetIndicatorBus,
  publishIndicatorChange,
} from "@/lib/services/indicator-events";
import { __resetIndicatorBroadcaster } from "@/lib/services/indicator-broadcaster";

const WORKSPACE = "workspace-a";

let unreadAlerts = 0;

beforeEach(() => {
  unreadAlerts = 0;
  mocks.requireAuthWithWorkspaceParam.mockResolvedValue({
    operator: { id: "op" },
    workspace: { id: WORKSPACE },
  });
  mocks.mailFolderFindMany.mockResolvedValue([]);
  mocks.mailItemCount.mockResolvedValue(0);
  mocks.messageCount.mockResolvedValue(0);
  mocks.reminderOccurrenceCount.mockResolvedValue(0);
  mocks.providerCredentialCount.mockResolvedValue(0);
  // First call is the unread total, second the critical subset.
  mocks.alertCount.mockImplementation(async () => unreadAlerts);
});

afterEach(() => {
  __resetIndicatorBroadcaster();
  __resetIndicatorBus();
  vi.clearAllMocks();
});

async function readOne(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const result = await reader.read();
  return result.done ? "" : new TextDecoder().decode(result.value);
}

describe("indicator stream wiring", () => {
  it("carries a domain publish through to an SSE frame", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/indicators/stream?workspace=${WORKSPACE}`,
      ),
    );
    const reader = response.body!.getReader();

    // Opening: the reconnect hint, then the current state (zero alerts).
    await readOne(reader);
    expect(await readOne(reader)).toContain('"alerts":0');

    // A domain service records an alert and announces it, exactly as
    // alerts.create() does after its write commits.
    unreadAlerts = 3;
    publishIndicatorChange(WORKSPACE, "alerts");

    expect(await readOne(reader)).toContain('"alerts":3');

    await reader.cancel();
  });

  it("does not deliver another workspace's publish", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/indicators/stream?workspace=${WORKSPACE}`,
      ),
    );
    const reader = response.body!.getReader();
    await readOne(reader);
    await readOne(reader);

    unreadAlerts = 3;
    publishIndicatorChange("some-other-workspace", "alerts");

    // Nothing for this stream: the next chunk is the heartbeat, not a state
    // frame. Racing a read against a timeout is safe here because we cancel
    // immediately afterwards.
    const next = await Promise.race([
      readOne(reader),
      new Promise<string>((resolve) => setTimeout(() => resolve("idle"), 800)),
    ]);
    expect(next).toBe("idle");

    await reader.cancel();
  });
});
