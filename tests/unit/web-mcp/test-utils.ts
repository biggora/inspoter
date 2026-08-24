import { vi, type Mock } from "vitest";

// Installs/uninstalls a mock `document.modelContext` (see
// src/types/web-mcp.d.ts) for tests that need `isWebMcpSupported()` to read
// `true`. Deliberately NOT wired into tests/setup.unit.ts — every other test
// in the suite must keep seeing `isWebMcpSupported() === false` by default,
// so each test that needs the mock installs/uninstalls it locally in
// beforeEach/afterEach.

export interface MockModelContext {
  registerTool: Mock<
    (
      tool: ModelContextTool,
      options?: ModelContextRegisterToolOptions,
    ) => Promise<undefined>
  >;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

export function installMockModelContext(): MockModelContext {
  const mock: MockModelContext = {
    registerTool: vi.fn().mockResolvedValue(undefined),
    ontoolchange: null,
  };

  Object.defineProperty(document, "modelContext", {
    value: mock,
    configurable: true,
    writable: true,
  });

  return mock;
}

export function uninstallMockModelContext(): void {
  Reflect.deleteProperty(document, "modelContext");
}
