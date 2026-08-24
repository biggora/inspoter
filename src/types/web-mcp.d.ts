export {};

// Ambient types for the WebMCP W3C draft (`document.modelContext`). Mirrors
// the WebIDL 1:1 — see the WebMCP explainer's ModelContext / ModelContextTool
// dictionaries. Intentionally minimal: no `getTools`/`executeTool`, those are
// out of scope for this layer.

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

  interface ModelContext extends EventTarget {
    registerTool(
      tool: ModelContextTool,
      options?: ModelContextRegisterToolOptions,
    ): Promise<undefined>;
    ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
  }

  interface Document {
    readonly modelContext: ModelContext;
  }
}
