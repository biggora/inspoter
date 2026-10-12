"use client";

import { createContext, useContext } from "react";

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
