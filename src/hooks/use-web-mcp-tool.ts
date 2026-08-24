import * as React from "react";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { isWebMcpSupported } from "@/lib/web-mcp/support";

// Registers a WebMCP tool via `document.modelContext.registerTool()` for as
// long as the calling component is mounted and `enabled` is true, and
// unregisters it (via AbortController) on cleanup.

export function useWebMcpTool(tool: WebMcpTool | null, enabled = true): void {
  const toolRef = React.useRef<WebMcpTool | null>(tool);
  // Keeps the ref current on every render. Assigning outside an effect would
  // mutate a ref during render, which this repo's `react-hooks/refs` lint
  // rule forbids — a no-deps effect runs after every render/commit instead,
  // which is soon enough since the ref is only read later, from the
  // `execute` wrapper below.
  React.useEffect(() => {
    toolRef.current = tool;
  });

  // Deliberately depends only on `[tool?.name, enabled]`, not the whole
  // `tool` object — a new `execute` closure from a parent re-render must
  // never trigger a re-register; the ref-reading wrapper below always calls
  // through to the current tool regardless.
  React.useEffect(() => {
    if (!enabled || !tool?.name || !isWebMcpSupported()) return;

    const controller = new AbortController();

    const execute = (input: Record<string, unknown>) =>
      toolRef.current!.execute(input);

    document.modelContext
      .registerTool({ ...tool, execute }, { signal: controller.signal })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[web-mcp] Failed to register tool "${tool.name}":`, err);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool?.name, enabled]);
}
