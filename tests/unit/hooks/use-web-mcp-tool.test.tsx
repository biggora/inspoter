// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { useWebMcpTool } from "@/hooks/use-web-mcp-tool";
import type { WebMcpTool, WebMcpToolResult } from "@/lib/web-mcp/define-tool";
import {
  expectToolJson,
  installMockModelContext,
  uninstallMockModelContext,
} from "../web-mcp/test-utils";

function makeTool(overrides: Partial<WebMcpTool> = {}): WebMcpTool {
  return {
    name: "example_tool",
    title: "Example tool",
    description: "An example tool.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async () => ({ content: [{ type: "text", text: '{"ok":true}' }] }),
    ...overrides,
  };
}

/** The tool result shape a handler-returned object gets wrapped in. */
function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

describe("useWebMcpTool", () => {
  afterEach(() => {
    uninstallMockModelContext();
  });

  it("is a no-op when WebMCP is unsupported", () => {
    const tool = makeTool();
    expect(() => renderHook(() => useWebMcpTool(tool))).not.toThrow();
  });

  it("registers once on mount when supported", () => {
    const mock = installMockModelContext();
    const tool = makeTool();

    renderHook(() => useWebMcpTool(tool));

    expect(mock.registerTool).toHaveBeenCalledTimes(1);
    const [registeredTool, options] = mock.registerTool.mock.calls[0];
    expect(registeredTool).toMatchObject({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("registers on navigator.modelContext when that is the only surface", () => {
    // The real-world Chrome case: nothing on `document`, everything on
    // `navigator`. This is the bug the surface resolution fixed.
    const mock = installMockModelContext({ surface: "navigator" });
    const tool = makeTool();

    renderHook(() => useWebMcpTool(tool));

    expect(mock.registerTool).toHaveBeenCalledTimes(1);
    expect(mock.registerTool.mock.calls[0][0].name).toBe("example_tool");
  });

  it("registers once on each context when both surfaces exist", () => {
    const mocks = installMockModelContext({ surface: "both" });
    const tool = makeTool();

    renderHook(() => useWebMcpTool(tool));

    expect(mocks.document.registerTool).toHaveBeenCalledTimes(1);
    expect(mocks.navigator.registerTool).toHaveBeenCalledTimes(1);
    expect(mocks.document.registerTool.mock.calls[0][0].name).toBe(
      "example_tool",
    );
    expect(mocks.navigator.registerTool.mock.calls[0][0].name).toBe(
      "example_tool",
    );
  });

  it("unregisters (aborts the signal) on unmount", () => {
    const mock = installMockModelContext();
    const tool = makeTool();

    const { unmount } = renderHook(() => useWebMcpTool(tool));
    const [, options] = mock.registerTool.mock.calls[0];
    expect(options?.signal?.aborted).toBe(false);

    unmount();

    expect(options?.signal?.aborted).toBe(true);
  });

  it("calls the returned unregister() handle on unmount", () => {
    // The shipping surface returns a handle instead of a Promise and may
    // ignore the AbortSignal entirely, so the handle is the only way out.
    const unregister = vi.fn();
    const mock = installMockModelContext({ surface: "navigator" });
    mock.registerTool.mockReturnValue({ unregister });

    const { unmount } = renderHook(() => useWebMcpTool(makeTool()));

    expect(unregister).not.toHaveBeenCalled();

    unmount();

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("never registers when enabled is false", () => {
    const mock = installMockModelContext();
    const tool = makeTool();

    renderHook(() => useWebMcpTool(tool, false));

    expect(mock.registerTool).not.toHaveBeenCalled();
  });

  it("reflects a fresh closure after rerender without re-registering (stale closure regression)", async () => {
    const mock = installMockModelContext();

    const { rerender } = renderHook(
      ({ value }: { value: number }) =>
        useWebMcpTool(
          makeTool({
            execute: async () => textResult({ value }),
          }),
        ),
      { initialProps: { value: 1 } },
    );

    expect(mock.registerTool).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ value: 2 });
    });

    // Still only the one, original registration — a new execute closure from
    // a re-render must never trigger a re-register.
    expect(mock.registerTool).toHaveBeenCalledTimes(1);

    const [registeredTool] = mock.registerTool.mock.calls[0];
    const result = await registeredTool.execute({});
    expect(expectToolJson(result as WebMcpToolResult)).toEqual({ value: 2 });
  });

  it("re-registers (and aborts the previous signal) when tool.name changes", () => {
    const mock = installMockModelContext();

    const { rerender } = renderHook(
      ({ name }: { name: string }) => useWebMcpTool(makeTool({ name })),
      { initialProps: { name: "tool_a" } },
    );

    expect(mock.registerTool).toHaveBeenCalledTimes(1);
    const [, firstOptions] = mock.registerTool.mock.calls[0];
    expect(firstOptions?.signal?.aborted).toBe(false);

    rerender({ name: "tool_b" });

    expect(firstOptions?.signal?.aborted).toBe(true);
    expect(mock.registerTool).toHaveBeenCalledTimes(2);
    const [secondTool] = mock.registerTool.mock.calls[1];
    expect(secondTool.name).toBe("tool_b");
  });

  describe("registration failures", () => {
    let warnSpy: MockInstance<(...args: unknown[]) => void>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("catches a rejected registration promise instead of leaving it unhandled", async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason);
      };
      process.on("unhandledRejection", onUnhandled);

      try {
        const mock = installMockModelContext();
        mock.registerTool.mockReturnValue(
          Promise.reject(new Error("registration refused")),
        );

        expect(() => renderHook(() => useWebMcpTool(makeTool()))).not.toThrow();

        // Two turns of the event loop: enough for an uncaught rejection to
        // have been reported by now.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(unhandled).toEqual([]);
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });

    it("swallows a synchronous throw and still registers on the other context", () => {
      const mocks = installMockModelContext({ surface: "both" });
      mocks.document.registerTool.mockImplementation(() => {
        throw new Error("InvalidStateError");
      });

      expect(() => renderHook(() => useWebMcpTool(makeTool()))).not.toThrow();

      expect(mocks.document.registerTool).toHaveBeenCalledTimes(1);
      expect(mocks.navigator.registerTool).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
