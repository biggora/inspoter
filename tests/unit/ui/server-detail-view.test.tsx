// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { ServerDetailView } from "@/components/servers/server-detail-view";

const apiMocks = vi.hoisted(() => ({
  getServerByLocalId: vi.fn(),
  getServerMetricsHistory: vi.fn(),
  getServer: vi.fn(),
  powerAction: vi.fn(),
  ServerNotFoundError: class ServerNotFoundError extends Error {},
}));

vi.mock("@/components/servers/api", () => apiMocks);

const liveMetrics = {
  state: "live" as const,
  receivedAt: new Date().toISOString(),
  cpuUsagePercent: 21.1,
  load1: 0.4,
  load5: 0.3,
  load15: 0.2,
  memoryTotalBytes: String(4 * 1024 ** 3),
  memoryAvailableBytes: String(2 * 1024 ** 3),
  swapTotalBytes: "0",
  swapFreeBytes: "0",
  filesystemTotalBytes: String(80 * 1024 ** 3),
  filesystemAvailableBytes: String(50 * 1024 ** 3),
  uptimeSeconds: "360000",
};

const server = {
  localServerId: "server-1",
  origin: "provider" as const,
  providerCredentialId: "cred-1",
  providerId: "provider-1",
  remoteServerId: "remote-1",
  providerAvailability: "present" as const,
  powerActionsAvailable: true,
  metrics: liveMetrics,
  name: "web-prod-01",
  type: "cx22",
  status: "running",
  ip: "203.0.113.1",
  cpu: "2 vCPU",
  ram: "4 GB",
  disk: "40 GB",
  os: "Ubuntu 24.04",
  location: "Helsinki",
};

function historyPoint(iso: string, overrides: Record<string, number> = {}) {
  return {
    t: iso,
    cpuAvg: 20,
    cpuMax: 40,
    load1: 0.4,
    load5: 0.3,
    load15: 0.2,
    memoryUsedBytes: 2 * 1024 ** 3,
    memoryTotalBytes: 4 * 1024 ** 3,
    memoryPercent: 50,
    swapUsedBytes: 0,
    swapTotalBytes: 0,
    swapPercent: null,
    diskUsedBytes: 30 * 1024 ** 3,
    diskTotalBytes: 80 * 1024 ** 3,
    diskPercent: 37.5,
    uptimeSeconds: 360000,
    ...overrides,
  };
}

const history = {
  range: "24h" as const,
  from: "2026-07-30T10:00:00.000Z",
  to: "2026-07-31T10:00:00.000Z",
  bucketSeconds: 600,
  points: [
    historyPoint("2026-07-31T09:00:00.000Z"),
    historyPoint("2026-07-31T09:10:00.000Z", { cpuAvg: 30, cpuMax: 60 }),
  ],
  reboots: [],
};

describe("ServerDetailView", () => {
  beforeEach(() => {
    apiMocks.getServerByLocalId.mockReset().mockResolvedValue(server);
    apiMocks.getServerMetricsHistory.mockReset().mockResolvedValue(history);
    apiMocks.getServer.mockReset().mockResolvedValue(server);
    apiMocks.powerAction.mockReset().mockResolvedValue({});
  });

  it("shows the server summary and the four metric charts", async () => {
    renderWithIntl(<ServerDetailView localServerId="server-1" />);

    expect(
      await screen.findByRole("heading", { name: "web-prod-01" }),
    ).toBeInTheDocument();
    // The address is stated once, in the header — the summary grid below
    // carries what the header doesn't.
    expect(screen.getByText("203.0.113.1")).toBeInTheDocument();
    expect(screen.getByText("cx22")).toBeInTheDocument();
    expect(screen.getByText("Ubuntu 24.04")).toBeInTheDocument();
    expect(screen.getByText("Helsinki")).toBeInTheDocument();

    expect(
      await screen.findByRole("img", {
        name: "График загрузки CPU сервера «web-prod-01»",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "График средней нагрузки сервера «web-prod-01»",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "График использования памяти сервера «web-prod-01»",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "График заполнения диска сервера «web-prod-01»",
      }),
    ).toBeInTheDocument();
  });

  it("requests 24 hours by default and reloads when another range is picked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServerDetailView localServerId="server-1" />);

    await waitFor(() =>
      expect(apiMocks.getServerMetricsHistory).toHaveBeenCalledWith(
        "server-1",
        "24h",
      ),
    );

    await user.click(screen.getByRole("button", { name: "5 суток" }));

    await waitFor(() =>
      expect(apiMocks.getServerMetricsHistory).toHaveBeenCalledWith(
        "server-1",
        "5d",
      ),
    );
  });

  it("honours the range carried in the URL", async () => {
    renderWithIntl(
      <ServerDetailView localServerId="server-1" initialRange="7d" />,
    );

    await waitFor(() =>
      expect(apiMocks.getServerMetricsHistory).toHaveBeenCalledWith(
        "server-1",
        "7d",
      ),
    );
  });

  it("states that there is no history instead of drawing empty charts", async () => {
    apiMocks.getServerMetricsHistory.mockResolvedValue({
      ...history,
      points: [],
    });
    renderWithIntl(<ServerDetailView localServerId="server-1" />);

    expect(
      await screen.findByText("Нет исторических данных"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", {
        name: "График загрузки CPU сервера «web-prod-01»",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the summary usable when only the history request fails", async () => {
    apiMocks.getServerMetricsHistory.mockRejectedValue(new Error("boom"));
    renderWithIntl(<ServerDetailView localServerId="server-1" />);

    expect(
      await screen.findByText("Не удалось загрузить историю метрик"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "web-prod-01" }),
    ).toBeInTheDocument();
  });

  it("offers the way back when the server is gone", async () => {
    apiMocks.getServerByLocalId.mockRejectedValue(
      new apiMocks.ServerNotFoundError(),
    );
    renderWithIntl(<ServerDetailView localServerId="missing" />);

    expect(await screen.findByText("Сервер не найден")).toBeInTheDocument();
    expect(screen.getByText("К серверам")).toBeInTheDocument();
  });

  // A server that has never reported is the normal state on the day an agent
  // is installed — the page has to render it, not fail on it.
  describe("with no data", () => {
    const noMetrics = {
      state: "not_configured" as const,
      receivedAt: null,
      cpuUsagePercent: null,
      load1: null,
      load5: null,
      load15: null,
      memoryTotalBytes: null,
      memoryAvailableBytes: null,
      swapTotalBytes: null,
      swapFreeBytes: null,
      filesystemTotalBytes: null,
      filesystemAvailableBytes: null,
      uptimeSeconds: null,
    };

    const emptyHistory = { ...history, points: [], reboots: [] };

    it("renders a provider server that has never reported, and offers the agent", async () => {
      apiMocks.getServerByLocalId.mockResolvedValue({
        ...server,
        metrics: noMetrics,
      });
      apiMocks.getServerMetricsHistory.mockResolvedValue(emptyHistory);

      renderWithIntl(<ServerDetailView localServerId="server-1" />);

      expect(
        await screen.findByRole("heading", { name: "web-prod-01" }),
      ).toBeInTheDocument();
      // Provider capacity still has something to say without an agent.
      expect(screen.getByText("2 vCPU")).toBeInTheDocument();
      expect(screen.getByText("Мониторинг не подключён")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Подключите агент метрик — история появится в течение нескольких минут после первой отправки.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Настроить мониторинг" }),
      ).toBeInTheDocument();
    });

    it("renders an agent-only server with no hostname and no metrics", async () => {
      apiMocks.getServerByLocalId.mockResolvedValue({
        localServerId: "agent-1",
        origin: "agent" as const,
        providerCredentialId: null,
        providerId: null,
        remoteServerId: null,
        providerAvailability: "not_applicable" as const,
        powerActionsAvailable: false,
        metrics: noMetrics,
        name: "orphan-host",
        hostname: null,
      });
      apiMocks.getServerMetricsHistory.mockResolvedValue(emptyHistory);

      renderWithIntl(<ServerDetailView localServerId="agent-1" />);

      expect(
        await screen.findByRole("heading", { name: "orphan-host" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Агент")).toBeInTheDocument();
      // No provider means no power actions to offer.
      expect(
        screen.queryByRole("button", { name: "Перезапустить" }),
      ).not.toBeInTheDocument();
    });

    it("falls back to the default range when the URL carries an unknown one", async () => {
      apiMocks.getServerMetricsHistory.mockResolvedValue(emptyHistory);

      renderWithIntl(
        <ServerDetailView localServerId="server-1" initialRange="1y" />,
      );

      await waitFor(() =>
        expect(apiMocks.getServerMetricsHistory).toHaveBeenCalledWith(
          "server-1",
          "24h",
        ),
      );
    });

    it("keeps the page standing when the history request 404s", async () => {
      apiMocks.getServerMetricsHistory.mockRejectedValue(
        new Error("Failed to fetch server metrics history"),
      );

      renderWithIntl(<ServerDetailView localServerId="server-1" />);

      expect(
        await screen.findByText("Не удалось загрузить историю метрик"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "web-prod-01" }),
      ).toBeInTheDocument();
    });
  });

  it("confirms a power action before calling the provider", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServerDetailView localServerId="server-1" />);

    await user.click(
      await screen.findByRole("button", { name: "Перезапустить" }),
    );
    expect(
      screen.getByRole("heading", { name: "Перезапустить «web-prod-01»?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Подтвердить" }));

    await waitFor(() =>
      expect(apiMocks.powerAction).toHaveBeenCalledWith(
        "provider-1",
        "remote-1",
        "restart",
      ),
    );
  });
});
