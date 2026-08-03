// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "../../test-utils";
import { WidgetConfigFields } from "@/components/dashboards/widget-config-fields";
import type { WidgetTargets } from "@/lib/services/dashboard-widget-targets";
import ruDashboards from "@/messages/ru/dashboards.json";

// The server-metrics settings form: a tile may watch any subset of the
// workspace's servers, and one configured before multi-select (a single
// `localServerId`) must open with that server still ticked.

const targets: WidgetTargets = {
  bookmarkCategories: [],
  services: [],
  servers: [
    { id: "srv-1", name: "web-prod-01" },
    { id: "srv-2", name: "db-prod-01" },
    { id: "srv-3", name: "staging-01" },
  ],
  mailAccounts: [],
};

function renderServerFields(config: Record<string, unknown>) {
  const onChange = vi.fn();
  renderWithIntl(
    <WidgetConfigFields
      kind="SERVER_METRICS"
      config={config}
      onChange={onChange}
      targets={targets}
    />,
  );
  return onChange;
}

describe("WidgetConfigFields — SERVER_METRICS", () => {
  it("offers every server as a checkbox, none ticked by default", () => {
    renderServerFields({});

    expect(
      screen.getByText(ruDashboards.serverMetrics.allServersHint),
    ).toBeInTheDocument();
    for (const server of targets.servers) {
      expect(
        screen.getByRole("checkbox", { name: server.name }),
      ).not.toBeChecked();
    }
  });

  it("ticks the servers the widget already watches", () => {
    renderServerFields({ localServerIds: ["srv-1", "srv-3"] });

    expect(screen.getByRole("checkbox", { name: "web-prod-01" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "db-prod-01" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "staging-01" })).toBeChecked();
  });

  it("ticks the server of a widget stored before multi-select", () => {
    renderServerFields({ localServerId: "srv-2" });

    expect(screen.getByRole("checkbox", { name: "db-prod-01" })).toBeChecked();
  });

  it("adds a server to the selection instead of replacing it", async () => {
    const onChange = renderServerFields({ localServerIds: ["srv-1"] });

    await userEvent.click(screen.getByRole("checkbox", { name: "staging-01" }));

    expect(onChange).toHaveBeenCalledWith({
      localServerIds: ["srv-1", "srv-3"],
    });
  });

  it("upgrades the legacy single server when another one is ticked", async () => {
    const onChange = renderServerFields({ localServerId: "srv-2" });

    await userEvent.click(screen.getByRole("checkbox", { name: "staging-01" }));

    expect(onChange).toHaveBeenCalledWith({
      localServerIds: ["srv-2", "srv-3"],
    });
  });
});
