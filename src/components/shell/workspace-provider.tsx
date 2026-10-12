"use client";

import { createContext, useContext, useLayoutEffect } from "react";

import { setActiveWorkspaceId } from "@/lib/client/active-workspace";

export interface CurrentWorkspace {
  id: string;
  slug: string;
  name: string;
}

const WorkspaceContext = createContext<CurrentWorkspace | null>(null);

// Carries the workspace the URL (`/w/<slug>`) selects to client components.
// The layout renders it with `key={workspace.id}`, so switching workspace in a
// tab remounts everything below it and no client state outlives the switch.
export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: CurrentWorkspace;
  children: React.ReactNode;
}) {
  // Seeds the per-tab id behind the X-Inspoter-Workspace header. A layout
  // effect runs on commit and before any passive effect, so a child's
  // mount-time fetch (a useEffect) already sends the right id. Doing it during
  // render instead would move the id for a tree React may never commit, under
  // handlers of the tree still on screen.
  useLayoutEffect(() => {
    setActiveWorkspaceId(workspace.id);
  }, [workspace.id]);

  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): CurrentWorkspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  }
  return workspace;
}
