import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetIndicatorBus,
  publishIndicatorChange,
  subscribeToIndicatorChanges,
} from "@/lib/services/indicator-events";

const WORKSPACE_A = "workspace-a";
const WORKSPACE_B = "workspace-b";

afterEach(() => {
  __resetIndicatorBus();
  vi.restoreAllMocks();
});

describe("indicator event bus", () => {
  it("delivers a publish to a subscriber of the same workspace", () => {
    const listener = vi.fn();
    subscribeToIndicatorChanges(WORKSPACE_A, listener);

    publishIndicatorChange(WORKSPACE_A, "mail");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      workspaceId: WORKSPACE_A,
      topics: ["mail"],
    });
  });

  it("never delivers across workspaces", () => {
    const listener = vi.fn();
    subscribeToIndicatorChanges(WORKSPACE_A, listener);

    publishIndicatorChange(WORKSPACE_B, "alerts");

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToIndicatorChanges(WORKSPACE_A, listener);

    unsubscribe();
    publishIndicatorChange(WORKSPACE_A, "mail");

    expect(listener).not.toHaveBeenCalled();
  });

  // A publish sits inside a domain service right after its write commits, so a
  // listener that throws must not surface there — and must not stop its
  // siblings from being notified.
  it("isolates a throwing listener from its siblings and from the publisher", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const healthy = vi.fn();
    subscribeToIndicatorChanges(WORKSPACE_A, () => {
      throw new Error("listener exploded");
    });
    subscribeToIndicatorChanges(WORKSPACE_A, healthy);

    expect(() => publishIndicatorChange(WORKSPACE_A, "mail")).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("is safe to publish with nobody listening", () => {
    expect(() =>
      publishIndicatorChange(WORKSPACE_A, "providers"),
    ).not.toThrow();
  });

  it("carries every topic the publisher named", () => {
    const listener = vi.fn();
    subscribeToIndicatorChanges(WORKSPACE_A, listener);

    publishIndicatorChange(WORKSPACE_A, "providers", "alerts");

    expect(listener.mock.calls[0][0].topics).toEqual(["providers", "alerts"]);
  });
});
