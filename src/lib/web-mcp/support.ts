// Feature-detects the WebMCP API (see src/types/web-mcp.d.ts).
//
// The API has shipped under two surfaces: `navigator.modelContext` in the
// Chrome builds that implement it today, and `document.modelContext` in the
// current W3C draft (which marks the navigator one deprecated). Browsers in
// the field expose one or the other, so we resolve every surface present and
// register on all of them — an agent may read tools from either. The `typeof`
// guards keep this safe to call during SSR, matching the `typeof window`
// idiom used in src/lib/client/active-workspace.ts.

/**
 * Every distinct ModelContext this browser exposes, newest surface first.
 * Deduplicated by identity: when both globals alias the same object (a
 * browser keeping `navigator.modelContext` as a pointer to the canonical
 * one), registering twice would fail with `InvalidStateError`.
 */
export function getModelContexts(): ModelContext[] {
  const contexts: ModelContext[] = [];

  if (typeof document !== "undefined" && "modelContext" in document) {
    contexts.push(document.modelContext);
  }

  if (typeof navigator !== "undefined" && "modelContext" in navigator) {
    const fromNavigator = (
      navigator as Navigator & { modelContext: ModelContext }
    ).modelContext;
    if (!contexts.includes(fromNavigator)) {
      contexts.push(fromNavigator);
    }
  }

  return contexts;
}

export function isWebMcpSupported(): boolean {
  return getModelContexts().length > 0;
}
