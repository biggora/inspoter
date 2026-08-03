// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "../../test-utils";
import { WidgetConfigFields } from "@/components/dashboards/widget-config-fields";
import type { WidgetTargets } from "@/lib/services/dashboard-widget-targets";
import ruDashboards from "@/messages/ru/dashboards.json";

// Two settings forms whose options are a selection rather than a single value:
// server-metrics (a tile may watch any subset of the workspace's servers, and
// one configured before multi-select must open with its server still ticked)
// and messages (a category or hand-picked channels of it).

const targets: WidgetTargets = {
  bookmarkCategories: [],
  services: [],
  servers: [
    { id: "srv-1", name: "web-prod-01" },
    { id: "srv-2", name: "db-prod-01" },
    { id: "srv-3", name: "staging-01" },
  ],
  mailAccounts: [],
  messageCategories: [
    { id: "cat-1", name: "Инциденты" },
    { id: "cat-2", name: "Релизы" },
  ],
  messageChannels: [
    { id: "ch-1", name: "prod-alerts", categoryId: "cat-1" },
    { id: "ch-2", name: "prod-incidents", categoryId: "cat-1" },
    { id: "ch-3", name: "release-notes", categoryId: "cat-2" },
  ],
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

function renderMessagesFields(config: Record<string, unknown>) {
  const onChange = vi.fn();
  renderWithIntl(
    <WidgetConfigFields
      kind="MESSAGES"
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

describe("WidgetConfigFields — MESSAGES", () => {
  it("offers every channel of the workspace when no category is chosen", () => {
    renderMessagesFields({});

    expect(
      screen.getByText(ruDashboards.messages.allChannelsHint),
    ).toBeInTheDocument();
    for (const channel of targets.messageChannels) {
      expect(
        screen.getByRole("checkbox", { name: channel.name }),
      ).not.toBeChecked();
    }
  });

  it("narrows the channel list to the chosen category", () => {
    renderMessagesFields({ categoryId: "cat-1" });

    expect(screen.getByRole("checkbox", { name: "prod-alerts" })).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "prod-incidents" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("checkbox", { name: "release-notes" }),
    ).not.toBeInTheDocument();
  });

  it("drops ticked channels that do not belong to the newly chosen category", async () => {
    const onChange = renderMessagesFields({
      channelIds: ["ch-1", "ch-3"],
    });

    await userEvent.selectOptions(
      screen.getByLabelText(ruDashboards.messages.categoryLabel),
      "cat-1",
    );

    expect(onChange).toHaveBeenCalledWith({
      categoryId: "cat-1",
      channelIds: ["ch-1"],
    });
  });

  it("keeps every ticked channel when the category is cleared", async () => {
    const onChange = renderMessagesFields({
      categoryId: "cat-1",
      channelIds: ["ch-1"],
    });

    await userEvent.selectOptions(
      screen.getByLabelText(ruDashboards.messages.categoryLabel),
      "",
    );

    expect(onChange).toHaveBeenCalledWith({
      categoryId: null,
      channelIds: ["ch-1"],
    });
  });

  it("adds a channel to the selection instead of replacing it", async () => {
    const onChange = renderMessagesFields({ channelIds: ["ch-1"] });

    await userEvent.click(
      screen.getByRole("checkbox", { name: "release-notes" }),
    );

    expect(onChange).toHaveBeenCalledWith({ channelIds: ["ch-1", "ch-3"] });
  });

  it("toggles the unread-only filter", async () => {
    const onChange = renderMessagesFields({});

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: ruDashboards.messages.unreadOnlyLabel,
      }),
    );

    expect(onChange).toHaveBeenCalledWith({ unreadOnly: true });
  });
});
