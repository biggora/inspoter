// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

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

    renderWithIntl(<ManagementView />);

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

    renderWithIntl(<ManagementView />);

    expect(await screen.findByText("Snapshot is unavailable")).toBeVisible();
    expect(await screen.findByText("No decisions yet")).toBeVisible();
  });
});
