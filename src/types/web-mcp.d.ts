export {};

// Ambient types for WebMCP. The API is exposed as `navigator.modelContext` by
// the Chrome builds shipping it today and as `document.modelContext` by the
// current W3C draft, so both globals are declared here and
// src/lib/web-mcp/support.ts resolves whichever exist at runtime.
//
// `registerTool` likewise differs between the two: the draft returns a
// Promise and unregisters through an AbortSignal, while the shipping surface
// returns a registration handle carrying `unregister()`. The union below
// covers both; src/hooks/use-web-mcp-tool.ts branches on what it gets back.

declare global {
  interface ToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  }

  type ToolExecuteCallback = (
    input: Record<string, unknown>,
  ) => Promise<unknown>;

  interface ModelContextTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: object;
    execute: ToolExecuteCallback;
    annotations?: ToolAnnotations;
  }

  interface ModelContextRegisterToolOptions {
    signal?: AbortSignal;
    exposedTo?: string[];
  }

  /** Returned by the shipping `registerTool`; absent in the draft's Promise. */
  interface ModelContextToolRegistration {
    unregister?: () => void;
  }

  /** A tool as reported back by `getTools()` — `inputSchema` is stringified. */
  interface RegisteredModelContextTool {
    name: string;
    description: string;
    inputSchema: string;
    annotations?: ToolAnnotations;
    origin?: string;
  }

  interface ModelContext extends EventTarget {
    registerTool(
      tool: ModelContextTool,
      options?: ModelContextRegisterToolOptions,
    ): Promise<undefined> | ModelContextToolRegistration | undefined;
    getTools(options?: {
      fromOrigins?: string[];
    }): Promise<RegisteredModelContextTool[]>;
    /** Takes the tool object from `getTools()` and a JSON-encoded argument string. */
    executeTool(
      tool: RegisteredModelContextTool,
      inputJson: string,
      options?: { signal?: AbortSignal },
    ): Promise<unknown>;
    ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
  }

  interface Document {
    readonly modelContext: ModelContext;
  }

  interface Navigator {
    readonly modelContext: ModelContext;
  }
}
