// Per-tab in-memory active workspace id, sent by every api.ts fetch wrapper as
// the X-Inspoter-Workspace header. Seeded from the `/w/<slug>` layout's
// WorkspaceProvider in a layout effect — on commit, never during render, so a
// tree that is rendered but not committed (a transition, a suspended
// navigation) cannot move the id under handlers of the tree still on screen
// (see src/components/shell/workspace-provider.tsx). The `typeof window` guard
// keeps this a no-op during SSR so the module singleton (shared by the Node
// process) never leaks between concurrent server requests; in the browser each
// tab gets its own module instance, which is what lets two tabs of one session
// work in different workspaces.

export const WORKSPACE_HEADER_NAME = "x-inspoter-workspace";

let activeWorkspaceId: string | null = null;

export function setActiveWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  activeWorkspaceId = id;
}

export function getActiveWorkspaceId(): string | null {
  return activeWorkspaceId;
}
