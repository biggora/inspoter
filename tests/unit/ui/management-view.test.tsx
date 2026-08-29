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
import { ManagementAutomationView } from "@/components/management/management-automation-view";
import { renderWithIntl } from "../../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ManagementView", () => {
  it("links snapshot totals into their sections and de-emphasizes zeros", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/management/setup")) {
          return {
            ok: true,
            json: async () => ({ status: "MISSING", missing: [], edited: [] }),
          };
        }
        if (url.includes("/api/management/briefs")) {
          return { ok: true, json: async () => [] };
        }
        if (url.includes("/api/management/decisions")) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        return {
          ok: true,
          json: async () => ({
            latestBrief: { headline: "Stable" },
            totals: { alerts: 3, services: 0, mail: 0 },
          }),
        };
      }),
    );

    renderWithIntl(<ManagementView kanbanTargets={[]} />);

    const alerts = await screen.findByText("Alerts");
    expect(alerts.closest("a")).toHaveAttribute("href", "/alerts");
    expect(screen.getByText("Services").closest("a")).toHaveAttribute(
      "href",
      "/services",
    );
    // Non-zero counts carry the emphasis; zeros read as muted.
    const nonZero = screen.getByText("3");
    const zero = screen.getAllByText("0")[0];
    expect(nonZero.className).toContain("text-2xl");
    expect(zero.className).not.toContain("text-2xl");

    // AI configuration moved off the landing behind a single link.
    expect(
      screen.getByRole("link", { name: "Configure automation" }),
    ).toHaveAttribute("href", "/management/automation");
    expect(screen.queryByText("AI provider")).toBeNull();
  });

  it("renders the AI summary status line on the landing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/management/setup")) {
          return {
            ok: true,
            json: async () => ({
              status: "READY",
              missing: [],
              edited: [],
              providerConfigured: true,
              parts: { agent: null, skill: null, daily: null, weekly: null },
            }),
          };
        }
        if (url.includes("/api/management/briefs")) {
          return {
            ok: true,
            json: async () => [
              {
                id: "brief-1",
                headline: "Overnight incident resolved",
                summary: "All affected services recovered.",
              },
            ],
          };
        }
        if (url.includes("/api/management/decisions")) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        return {
          ok: true,
          json: async () => ({ latestBrief: { headline: "Stable" } }),
        };
      }),
    );

    renderWithIntl(<ManagementView kanbanTargets={[]} />);

    expect(await screen.findByText("Brief automation is ready")).toBeVisible();
    expect(screen.getByText("Overnight incident resolved")).toBeVisible();
  });
});

describe("ManagementAutomationView", () => {
  it("renders brief automation as actionable component cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/management/setup")) {
          return {
            ok: true,
            json: async () => ({
              status: "READY",
              missing: [],
              edited: [],
              providerConfigured: true,
              agentId: "agent-1",
              skillId: "skill-1",
              parts: {
                agent: {
                  id: "agent-1",
                  name: "Executive brief agent",
                  isActive: true,
                },
                skill: {
                  id: "skill-1",
                  name: "Executive brief workflow",
                  isActive: true,
                  toolNames: [
                    "management_snapshot_get",
                    "management_brief_publish",
                  ],
                },
                daily: {
                  id: "daily-1",
                  name: "Executive brief (daily)",
                  isActive: true,
                  minuteOfDay: 480,
                  daysOfWeek: [],
                  timeZone: "Europe/Riga",
                  nextRunAt: "2026-08-28T05:00:00.000Z",
                },
                weekly: {
                  id: "weekly-1",
                  name: "Executive brief (weekly)",
                  isActive: true,
                  minuteOfDay: 495,
                  daysOfWeek: [1],
                  timeZone: "Europe/Riga",
                  nextRunAt: "2026-08-31T05:15:00.000Z",
                },
              },
            }),
          };
        }
        if (url.includes("/api/management/briefs")) {
          return { ok: true, json: async () => [] };
        }
        if (url.includes("/api/management/decisions")) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        return {
          ok: true,
          json: async () => ({ latestBrief: { headline: "Stable" } }),
        };
      }),
    );

    renderWithIntl(<ManagementAutomationView />);

    expect(await screen.findByText("AI provider")).toBeVisible();
    expect(screen.getByText("Executive brief agent")).toBeVisible();
    expect(screen.getByText("Executive brief workflow")).toBeVisible();
    expect(screen.getByText("Executive brief (daily)")).toBeVisible();
    expect(screen.getByText("Executive brief (weekly)")).toBeVisible();
    expect(screen.queryByText("agent, skill, daily, weekly")).toBeNull();
    expect(screen.getByRole("link", { name: "Configure" })).toHaveAttribute(
      "href",
      "/settings/providers",
    );
    expect(
      screen.getAllByRole("link", { name: "Open settings" })[0],
    ).toHaveAttribute("href", "/agents/agent-1");
  });

  it("renders brief items as cards with evidence actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/management/briefs/brief-1")) {
          return {
            ok: true,
            json: async () => ({
              id: "brief-1",
              headline: "Overnight incident resolved",
              summary: "All affected services recovered.",
              highlights: [
                {
                  title: "Full recovery confirmed",
                  detail: "All providers reported reachable again.",
                  evidenceRefs: ["alert:alert-1", "service:service-1"],
                },
              ],
              risks: [
                {
                  title: "Simultaneous timeouts",
                  detail: "Three services timed out together.",
                  evidenceRefs: ["alert:alert-2"],
                },
              ],
              opportunities: [],
            }),
          };
        }
        if (url.includes("/api/management/briefs")) {
          return {
            ok: true,
            json: async () => [
              {
                id: "brief-1",
                headline: "Overnight incident resolved",
                summary: "All affected services recovered.",
              },
            ],
          };
        }
        if (url.includes("/api/management/setup")) {
          return {
            ok: true,
            json: async () => ({
              status: "MISSING",
              missing: ["agent", "skill", "daily", "weekly"],
              edited: [],
              providerConfigured: false,
              parts: {
                agent: null,
                skill: null,
                daily: null,
                weekly: null,
              },
            }),
          };
        }
        if (url.includes("/api/management/decisions")) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        return {
          ok: true,
          json: async () => ({ latestBrief: { headline: "Stable" } }),
        };
      }),
    );

    renderWithIntl(<ManagementAutomationView />);

    fireEvent.click(
      await screen.findByRole("button", { name: "View details" }),
    );

    expect(await screen.findByText("Full recovery confirmed")).toBeVisible();
    expect(screen.getByText("Simultaneous timeouts")).toBeVisible();
    expect(screen.queryByText(/"evidenceRefs"/)).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Source 1" })[0],
    ).toHaveAttribute("href", "/alerts?alert=alert-1");
    expect(screen.getByText("No items in this section.")).toBeVisible();
  });
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
