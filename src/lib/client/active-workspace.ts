// Per-tab in-memory active workspace id (R2.1c, remediation-plan.md).
// Seeded synchronously — during render, not in an effect — from the
// server-rendered workspace id on every AppSidebar render (see
// src/components/shell/app-sidebar.tsx). The `typeof window` guard keeps
// this a no-op during SSR so the module singleton (shared by the Node
// process) never leaks between concurrent server requests; in the browser
// each tab gets its own module instance, which is exactly what lets a
// stale tab keep sending its old workspace id in the
// X-Inspoter-Workspace header until it re-renders with a fresh one.

export const WORKSPACE_HEADER_NAME = "x-inspoter-workspace";

let activeWorkspaceId: string | null = null;

export function setActiveWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  activeWorkspaceId = id;
}

export function getActiveWorkspaceId(): string | null {
  return activeWorkspaceId;
}
