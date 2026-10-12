// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useEffect } from "react";

import { WorkspaceProvider } from "@/components/shell/workspace-provider";
import { getActiveWorkspaceId } from "@/lib/client/active-workspace";

// The per-tab id behind the X-Inspoter-Workspace header must move on commit,
// not while the new `/w/<slug>` tree renders: until the commit, handlers of the
// tree still on screen keep sending their own workspace (plan §4.4, §9).

const WORKSPACE_A = { id: "workspace-a", slug: "a", name: "A" };
const WORKSPACE_B = { id: "workspace-b", slug: "b", name: "B" };

function Probe({
  onRender,
  onCommit,
}: {
  onRender: (id: string | null) => void;
  onCommit: (id: string | null) => void;
}) {
  onRender(getActiveWorkspaceId());
  // A passive effect: what a child's mount-time fetch would observe.
  useEffect(() => {
    onCommit(getActiveWorkspaceId());
  });
  return null;
}

function tree(
  workspace: typeof WORKSPACE_A,
  onRender: (id: string | null) => void,
  onCommit: (id: string | null) => void,
) {
  return (
    <WorkspaceProvider key={workspace.id} workspace={workspace}>
      <Probe onRender={onRender} onCommit={onCommit} />
    </WorkspaceProvider>
  );
}

describe("WorkspaceProvider per-tab id seeding", () => {
  it("seeds the id on commit, before a child's passive effect runs", () => {
    const onRender = vi.fn();
    const onCommit = vi.fn();

    render(tree(WORKSPACE_A, onRender, onCommit));

    expect(onCommit).toHaveBeenLastCalledWith(WORKSPACE_A.id);
    expect(getActiveWorkspaceId()).toBe(WORKSPACE_A.id);
  });

  it("leaves the id alone while the new workspace's tree renders, and moves it after commit", () => {
    const first = render(tree(WORKSPACE_A, vi.fn(), vi.fn()));
    expect(getActiveWorkspaceId()).toBe(WORKSPACE_A.id);

    const onRender = vi.fn();
    const onCommit = vi.fn();
    first.rerender(tree(WORKSPACE_B, onRender, onCommit));

    // Render phase of the B tree: handlers of the A tree would still have
    // read A here.
    expect(onRender).toHaveBeenCalledWith(WORKSPACE_A.id);
    expect(onRender).not.toHaveBeenCalledWith(WORKSPACE_B.id);
    // After commit, and by the time B's own effects run: B.
    expect(onCommit).toHaveBeenLastCalledWith(WORKSPACE_B.id);
    expect(getActiveWorkspaceId()).toBe(WORKSPACE_B.id);
  });
});
