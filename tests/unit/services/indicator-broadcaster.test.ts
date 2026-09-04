import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  computeIndicatorState: vi.fn(),
}));

vi.mock("@/lib/services/indicator-counts", () => ({
  computeIndicatorState: mocks.computeIndicatorState,
}));

import {
  __resetIndicatorBroadcaster,
  subscribeToIndicatorSnapshots,
} from "@/lib/services/indicator-broadcaster";
import {
  __resetIndicatorBus,
  publishIndicatorChange,
} from "@/lib/services/indicator-events";

const WORKSPACE = "workspace-a";

const STATE = {
  mail: 1,
  alerts: 0,
  messages: 0,
  calendar: 0,
  providersOk: 3,
  providersErrored: 0,
  openCriticalAlerts: 0,
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.computeIndicatorState.mockReset();
  mocks.computeIndicatorState.mockResolvedValue(STATE);
});

afterEach(() => {
  __resetIndicatorBroadcaster();
  __resetIndicatorBus();
  vi.useRealTimers();
});

/** Let the debounce fire and the recompute promise settle. */
async function settle() {
  await vi.advanceTimersByTimeAsync(500);
}

describe("indicator broadcaster", () => {
  it("coalesces a burst of publishes into one recompute and one frame", async () => {
    const listener = vi.fn();
    subscribeToIndicatorSnapshots(WORKSPACE, listener);

    for (let i = 0; i < 5; i += 1) publishIndicatorChange(WORKSPACE, "mail");
    await settle();

    expect(mocks.computeIndicatorState).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(STATE);
  });

  // Several tabs of one workspace must not multiply the query load.
  it("recomputes once for many listeners on the same workspace", async () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeToIndicatorSnapshots(WORKSPACE, first);
    subscribeToIndicatorSnapshots(WORKSPACE, second);

    publishIndicatorChange(WORKSPACE, "mail");
    await settle();

    expect(mocks.computeIndicatorState).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // An event that moved nothing the indicators care about must not wake a tab.
  it("drops a frame identical to the last one sent", async () => {
    const listener = vi.fn();
    subscribeToIndicatorSnapshots(WORKSPACE, listener);

    publishIndicatorChange(WORKSPACE, "mail");
    await settle();
    publishIndicatorChange(WORKSPACE, "mail");
    await settle();

    expect(mocks.computeIndicatorState).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("sends again once the numbers actually change", async () => {
    const listener = vi.fn();
    subscribeToIndicatorSnapshots(WORKSPACE, listener);

    publishIndicatorChange(WORKSPACE, "mail");
    await settle();
    mocks.computeIndicatorState.mockResolvedValue({ ...STATE, mail: 2 });
    publishIndicatorChange(WORKSPACE, "mail");
    await settle();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ ...STATE, mail: 2 });
  });

  // The leak that would otherwise keep querying the database for a closed tab.
  it("leaves no timer or subscription behind after the last unsubscribe", async () => {
    const unsubscribe = subscribeToIndicatorSnapshots(WORKSPACE, vi.fn());
    publishIndicatorChange(WORKSPACE, "mail");

    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);

    mocks.computeIndicatorState.mockClear();
    publishIndicatorChange(WORKSPACE, "mail");
    await settle();
    expect(mocks.computeIndicatorState).not.toHaveBeenCalled();
  });

  it("keeps delivering to the remaining listeners when one unsubscribes", async () => {
    const staying = vi.fn();
    const leaving = vi.fn();
    subscribeToIndicatorSnapshots(WORKSPACE, staying);
    const unsubscribe = subscribeToIndicatorSnapshots(WORKSPACE, leaving);

    unsubscribe();
    publishIndicatorChange(WORKSPACE, "mail");
    await settle();

    expect(staying).toHaveBeenCalledTimes(1);
    expect(leaving).not.toHaveBeenCalled();
  });

  it("survives a failed recompute and recovers on the next event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn();
    subscribeToIndicatorSnapshots(WORKSPACE, listener);

    mocks.computeIndicatorState.mockRejectedValueOnce(new Error("db down"));
    publishIndicatorChange(WORKSPACE, "mail");
    await settle();
    expect(listener).not.toHaveBeenCalled();

    publishIndicatorChange(WORKSPACE, "mail");
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
