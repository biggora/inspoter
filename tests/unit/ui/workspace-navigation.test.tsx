// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { MembersSection } from "@/components/workspace/members-section";
import type { MemberWithOperator } from "@/lib/services/workspaces";

// Workspace-in-URL, Slice 3: the two forms that change which workspace the tab
// shows navigate with the locale-aware router, and every other member removal
// only refreshes.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  create: vi.fn(),
  removeMember: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/components/workspace/api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;
  }
  return {
    ApiError,
    workspacesApi: {
      create: mocks.create,
      removeMember: mocks.removeMember,
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateWorkspaceForm", () => {
  async function submit(name: string) {
    const user = userEvent.setup();
    renderWithIntl(<CreateWorkspaceForm />);
    await user.type(screen.getByLabelText("New Workspace Name"), name);
    await user.click(screen.getByRole("button", { name: "Create Workspace" }));
  }

  it("opens the new workspace's settings page", async () => {
    mocks.create.mockResolvedValue({
      id: "ws-new",
      name: "New",
      slug: "new-1",
    });

    await submit("New");

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/w/new-1/settings/workspace"),
    );
    expect(mocks.create).toHaveBeenCalledWith("New");
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not navigate when the name is blank", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CreateWorkspaceForm />);

    await user.click(screen.getByRole("button", { name: "Create Workspace" }));

    expect(
      await screen.findByText("Workspace name is required."),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not navigate when creation fails", async () => {
    mocks.create.mockRejectedValue(new Error("boom"));

    await submit("New");

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("MembersSection removal", () => {
  function member(id: string, operatorId: string, username: string) {
    return {
      id,
      workspaceId: "ws-1",
      operatorId,
      role: "OWNER",
      joinedAt: new Date("2026-01-01T00:00:00Z"),
      operator: { id: operatorId, username },
    } as MemberWithOperator;
  }

  async function removeMember(username: string) {
    const user = userEvent.setup();
    renderWithIntl(
      <MembersSection
        workspaceId="ws-1"
        currentOperatorId="op-me"
        members={[
          member("m-me", "op-me", "me"),
          member("m-other", "op-2", "other"),
        ]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: `Remove ${username}` }),
    );
    await user.click(await screen.findByRole("button", { name: "Remove" }));
  }

  it("leaves the workspace by navigating to / when the operator removes themself", async () => {
    mocks.removeMember.mockResolvedValue(undefined);

    await removeMember("me");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
    expect(mocks.removeMember).toHaveBeenCalledWith("ws-1", "m-me");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("only refreshes when the operator removes someone else", async () => {
    mocks.removeMember.mockResolvedValue(undefined);

    await removeMember("other");

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.removeMember).toHaveBeenCalledWith("ws-1", "m-other");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("neither navigates nor refreshes when the removal fails", async () => {
    mocks.removeMember.mockRejectedValue(new Error("boom"));

    await removeMember("me");

    await waitFor(() => expect(mocks.removeMember).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
