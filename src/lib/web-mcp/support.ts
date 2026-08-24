// Feature-detects the WebMCP `document.modelContext` API (see
// src/types/web-mcp.d.ts). The `typeof document` guard keeps this safe to
// call during SSR, matching the `typeof window` idiom used in
// src/lib/client/active-workspace.ts.

export function isWebMcpSupported(): boolean {
  return typeof document !== "undefined" && "modelContext" in document;
}
