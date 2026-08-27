// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { ManagementView } from "@/components/management/management-view";
import { renderWithIntl } from "../../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ManagementView", () => {
  it("renders independently loaded snapshot and decision summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            latestBrief: {
              headline: "Operations are stable",
              summary: "No critical issues need attention.",
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "decision-1",
                title: "Approve the maintenance window",
                priority: "HIGH",
                status: "OPEN",
              },
            ],
          }),
        }),
    );

    renderWithIntl(<ManagementView kanbanTargets={[]} />);

    expect(await screen.findByText("Operations are stable")).toBeVisible();
    expect(
      await screen.findByText("Approve the maintenance window"),
    ).toBeVisible();
    expect(screen.getAllByText("High")).toHaveLength(2);
    expect(screen.getByText("Open")).toBeVisible();
  });

  it("keeps one card usable when the other endpoint is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) }),
    );

    renderWithIntl(<ManagementView kanbanTargets={[]} />);

    expect(await screen.findByText("Snapshot is unavailable")).toBeVisible();
    expect(await screen.findByText("No decisions yet")).toBeVisible();
  });

  it("binds a Kanban action to a real board and column id", async () => {
    const decision = {
      id: "decision-kanban",
      title: "Investigate the failed search",
      version: 3,
      priority: "MEDIUM",
      status: "APPROVED",
      executionStatus: "FAILED",
      actionType: "CREATE_KANBAN_CARD",
      actionPayload: {
        columnId: "TODO",
        title: "Review the 503 root cause",
      },
      evidenceRefs: [],
      events: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/api/management/decisions/${decision.id}`)) {
        return { ok: true, json: async () => decision };
      }
      if (url.includes("/api/management/decisions")) {
        return { ok: true, json: async () => ({ items: [decision] }) };
      }
      if (url.includes("/api/management/setup")) {
        return {
          ok: true,
          json: async () => ({
            status: "MISSING",
            missing: [],
            edited: [],
            providerConfigured: false,
          }),
        };
      }
      if (url.includes("/api/management/briefs")) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => ({ latestBrief: { headline: "Stable" } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithIntl(
      <ManagementView
        kanbanTargets={[
          {
            id: "board-1",
            name: "Operations",
            columns: [
              { id: "column-todo", name: "TODO", isDone: false },
              { id: "column-done", name: "Done", isDone: true },
            ],
          },
        ]}
      />,
    );

    expect(await screen.findByText("Choose destination")).toBeVisible();
    expect(screen.queryByText("Retry action")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(await screen.findByLabelText("Kanban board")).toHaveValue("board-1");
    expect(screen.getByLabelText("Column")).toHaveValue("column-todo");
    fireEvent.click(screen.getByRole("button", { name: "Save destination" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/management/decisions/${decision.id}`,
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"columnId":"column-todo"'),
        }),
      ),
    );
  });

  it("opens a completed Kanban result on its board", async () => {
    const decision = {
      id: "decision-completed-kanban",
      title: "Review the completed task",
      version: 5,
      priority: "MEDIUM",
      status: "APPROVED",
      executionStatus: "SUCCEEDED",
      actionType: "CREATE_KANBAN_CARD",
      actionPayload: {
        columnId: "column-backlog",
        title: "Review the incident",
      },
      resultId: "card-1",
      resultHref: "/kanban?card=card-1",
      evidenceRefs: [],
      receipts: [
        {
          liveTargetId: "card-1",
          liveTargetHref: "/kanban?card=card-1",
          targetAvailability: "AVAILABLE",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/management/decisions")) {
          return { ok: true, json: async () => ({ items: [decision] }) };
        }
        if (url.includes("/api/management/setup")) {
          return {
            ok: true,
            json: async () => ({
              status: "MISSING",
              missing: [],
              edited: [],
              providerConfigured: false,
            }),
          };
        }
        if (url.includes("/api/management/briefs")) {
          return { ok: true, json: async () => [] };
        }
        return {
          ok: true,
          json: async () => ({ latestBrief: { headline: "Stable" } }),
        };
      }),
    );

    renderWithIntl(
      <ManagementView
        kanbanTargets={[
          {
            id: "board-1",
            name: "Operations",
            columns: [{ id: "column-backlog", name: "Backlog", isDone: false }],
          },
        ]}
      />,
    );

    const openResult = await screen.findByText("Open result");
    expect(openResult.closest("a")).toHaveAttribute(
      "href",
      "/kanban/board-1?card=card-1",
    );
  });
});
