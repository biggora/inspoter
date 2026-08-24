// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useWebMcpTool } from "@/hooks/use-web-mcp-tool";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import {
  installMockModelContext,
  uninstallMockModelContext,
} from "../web-mcp/test-utils";

function makeTool(overrides: Partial<WebMcpTool> = {}): WebMcpTool {
  return {
    name: "example_tool",
    description: "An example tool.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async () => ({ ok: true }),
    ...overrides,
  };
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

  it("unregisters (aborts the signal) on unmount", () => {
    const mock = installMockModelContext();
    const tool = makeTool();

    const { unmount } = renderHook(() => useWebMcpTool(tool));
    const [, options] = mock.registerTool.mock.calls[0];
    expect(options?.signal?.aborted).toBe(false);

    unmount();

    expect(options?.signal?.aborted).toBe(true);
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
            execute: async () => ({ value }),
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
    expect(result).toEqual({ value: 2 });
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
});
