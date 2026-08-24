import { expect, vi, type Mock } from "vitest";

import type { WebMcpToolResult } from "@/lib/web-mcp/define-tool";

// Shared helpers for the WebMCP suites: a mock ModelContext installer and
// assertions over the MCP tool-result shape `execute()` always resolves to.
//
// The mock can go on `document.modelContext`, `navigator.modelContext`, or
// both (see src/types/web-mcp.d.ts — the API ships under both surfaces).
// Deliberately NOT wired into tests/setup.unit.ts — every other test in the
// suite must keep seeing `isWebMcpSupported() === false` by default, so each
// test that needs the mock installs/uninstalls it locally in
// beforeEach/afterEach.

/** Covers both registration idioms: the draft's Promise and the handle. */
type RegisterToolFn = (
  tool: ModelContextTool,
  options?: ModelContextRegisterToolOptions,
) => Promise<undefined> | ModelContextToolRegistration | undefined;

export interface MockModelContext {
  registerTool: Mock<RegisterToolFn>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

/** Both mocks, returned when installing on `surface: "both"`. */
export interface MockModelContexts {
  document: MockModelContext;
  navigator: MockModelContext;
}

export type MockModelContextSurface = "document" | "navigator" | "both";

/** A fresh mock context, not attached to any global. */
export function createMockModelContext(): MockModelContext {
  return {
    registerTool: vi.fn<RegisterToolFn>(() => Promise.resolve(undefined)),
    ontoolchange: null,
  };
}

/**
 * Defines `modelContext` on one global. Exported so a test can point both
 * globals at the SAME mock, which `getModelContexts()` must deduplicate.
 */
export function defineModelContext(
  target: Document | Navigator,
  mock: MockModelContext,
): MockModelContext {
  Object.defineProperty(target, "modelContext", {
    value: mock,
    configurable: true,
    writable: true,
  });
  return mock;
}

export function installMockModelContext(options?: {
  surface?: "document" | "navigator";
}): MockModelContext;
export function installMockModelContext(options: {
  surface: "both";
}): MockModelContexts;
export function installMockModelContext(
  options: { surface?: MockModelContextSurface } = {},
): MockModelContext | MockModelContexts {
  const surface = options.surface ?? "document";

  if (surface === "both") {
    return {
      document: defineModelContext(document, createMockModelContext()),
      navigator: defineModelContext(navigator, createMockModelContext()),
    };
  }

  return defineModelContext(
    surface === "document" ? document : navigator,
    createMockModelContext(),
  );
}

export function uninstallMockModelContext(): void {
  Reflect.deleteProperty(document, "modelContext");
  Reflect.deleteProperty(navigator, "modelContext");
}

// --- tool-result assertions ---

/** Asserts a successful result and returns its single text block. */
export function expectToolText(result: WebMcpToolResult): string {
  expect(result.isError).toBeFalsy();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return result.content[0].text;
}

/** Asserts an `isError` result and returns the message the agent would read. */
export function expectToolError(result: WebMcpToolResult): string {
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return result.content[0].text;
}

/** Asserts a successful result and parses its JSON-encoded payload. */
export function expectToolJson<T = unknown>(result: WebMcpToolResult): T {
  return JSON.parse(expectToolText(result)) as T;
}
