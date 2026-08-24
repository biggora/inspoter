import * as React from "react";
import type { WebMcpTool } from "@/lib/web-mcp/define-tool";
import { getModelContexts } from "@/lib/web-mcp/support";

// Registers a WebMCP tool for as long as the calling component is mounted and
// `enabled` is true. Registration goes to every ModelContext surface the
// browser exposes (see src/lib/web-mcp/support.ts), and unregistration
// supports both idioms: the W3C draft's AbortSignal and the shipping API's
// returned `unregister()` handle.

function unregisterQuietly(unregister: () => void): void {
  try {
    unregister();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[web-mcp] Failed to unregister a tool:", err);
    }
  }
}

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
    if (!enabled || !tool?.name) return;

    const contexts = getModelContexts();
    if (contexts.length === 0) return;

    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    const execute = (input: Record<string, unknown>) =>
      toolRef.current!.execute(input);

    for (const context of contexts) {
      let result: ReturnType<ModelContext["registerTool"]>;
      try {
        result = context.registerTool(
          { ...tool, execute },
          { signal: controller.signal },
        );
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[web-mcp] Failed to register tool "${tool.name}":`,
            err,
          );
        }
        continue;
      }

      if (typeof (result as Promise<undefined>)?.then === "function") {
        // Draft surface: rejects on failure, unregisters via the signal.
        (result as Promise<undefined>).catch((err: unknown) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[web-mcp] Failed to register tool "${tool.name}":`,
              err,
            );
          }
        });
        continue;
      }

      const unregister = (result as ModelContextToolRegistration | undefined)
        ?.unregister;
      if (typeof unregister === "function") {
        // Shipping surface: the returned handle is the only way back out, so
        // the AbortSignal above may well have been ignored.
        cleanups.push(() => unregisterQuietly(unregister.bind(result)));
      }
    }

    return () => {
      controller.abort();
      for (const cleanup of cleanups) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool?.name, enabled]);
}
