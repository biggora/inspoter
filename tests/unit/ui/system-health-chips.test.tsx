// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { __resetIndicatorStore } from "@/components/shell/indicator-store";
import { IndicatorSeedProvider } from "@/components/shell/indicator-store-provider";
import { SystemHealthChips } from "@/components/shell/system-health-chips";
import { renderWithIntl } from "../../test-utils";

const ZERO = {
  mail: 0,
  alerts: 0,
  messages: 0,
  calendar: 0,
  providersOk: 0,
  providersErrored: 0,
  openCriticalAlerts: 0,
};

afterEach(() => {
  __resetIndicatorStore();
});

function renderChips(
  seed: Partial<typeof ZERO>,
  variant: "sidebar" | "panel" = "sidebar",
) {
  return renderWithIntl(
    <IndicatorSeedProvider value={{ ...ZERO, ...seed }}>
      <SystemHealthChips variant={variant} />
    </IndicatorSeedProvider>,
  );
}

describe("SystemHealthChips", () => {
  it("reports connected providers when none has errored", () => {
    renderChips({ providersOk: 7 });
    expect(screen.getByText("7 providers connected")).toBeVisible();
  });

  it("leads with the error count when a provider has errored", () => {
    renderChips({ providersOk: 6, providersErrored: 1 });
    expect(screen.getByText("1 provider error")).toBeVisible();
    expect(screen.queryByText("6 providers connected")).toBeNull();
  });

  it("says so when no provider is configured at all", () => {
    renderChips({});
    expect(screen.getByText("No providers configured")).toBeVisible();
  });

  it("distinguishes open criticals from an all-clear", () => {
    const { unmount } = renderChips({ openCriticalAlerts: 3 });
    expect(screen.getByText("3 open critical alerts")).toBeVisible();
    unmount();
    __resetIndicatorStore();

    renderChips({});
    expect(screen.getByText("No open critical alerts")).toBeVisible();
  });

  it("links each chip to the section that explains it", () => {
    renderChips({ providersOk: 2 });
    expect(
      screen.getByText("2 providers connected").closest("a"),
    ).toHaveAttribute("href", "/settings/providers");
    expect(
      screen.getByText("No open critical alerts").closest("a"),
    ).toHaveAttribute("href", "/alerts");
  });

  // The regression this component exists to prevent: the sidebar footer and the
  // management page used to carry byte-identical copies of these ternaries, fed
  // by two independent server calls, and showed different numbers on one screen.
  it("renders identical wording in both variants for identical state", () => {
    const seed = { providersOk: 6, providersErrored: 1, openCriticalAlerts: 3 };

    const sidebar = renderChips(seed, "sidebar");
    const sidebarText = within(sidebar.container)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    sidebar.unmount();
    __resetIndicatorStore();

    const panel = renderChips(seed, "panel");
    const panelText = within(panel.container)
      .getAllByRole("listitem")
      .map((item) => item.textContent);

    expect(panelText).toEqual(sidebarText);
    expect(sidebarText).toEqual(["1 provider error", "3 open critical alerts"]);
  });
});
