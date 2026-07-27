// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { ServersView } from "@/components/servers/servers-view";

const apiMocks = vi.hoisted(() => ({
  fetchServers: vi.fn(),
  // The listing is served from a cached snapshot, so every operator-initiated
  // reload (Refresh, Retry, after saving a credential) goes through the
  // forced-refresh endpoint instead of the plain fetch.
  refreshServers: vi.fn(),
  getServer: vi.fn(),
  powerAction: vi.fn(),
}));

const credentialsMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/components/servers/api", () => apiMocks);
vi.mock("@/components/settings/credentials-api", () => ({
  ApiError: class ApiError extends Error {},
  credentialsApi: {
    create: credentialsMocks.create,
  },
}));

const defaultMetrics = {
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

const runningServer = {
  localServerId: "server-1",
  origin: "provider" as const,
  providerCredentialId: "cred-1",
  providerId: "provider-1",
  remoteServerId: "remote-1",
  providerAvailability: "present" as const,
  powerActionsAvailable: true,
  metrics: defaultMetrics,
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

const composedResponse = {
  servers: [runningServer],
  providerErrors: [],
};

describe("ServersView destructive actions", () => {
  beforeEach(() => {
    apiMocks.fetchServers.mockReset().mockResolvedValue(composedResponse);
    apiMocks.refreshServers.mockReset().mockResolvedValue(composedResponse);
    apiMocks.getServer.mockReset().mockResolvedValue(runningServer);
    apiMocks.powerAction.mockReset().mockResolvedValue({});
    credentialsMocks.create.mockReset().mockResolvedValue({});
  });

  it("opens the create-provider dialog from the header and reloads after save", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServersView />);

    const addProvider = await screen.findByRole("button", {
      name: "Добавить провайдера",
    });
    const refresh = screen.getByRole("button", { name: "Обновить" });

    expect(
      addProvider.compareDocumentPosition(refresh) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      addProvider.querySelector("[data-icon='inline-start']"),
    ).toBeTruthy();

    await user.click(addProvider);

    expect(
      screen.getByRole("heading", { name: "Добавить провайдера" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Провайдер" }));
    await user.click(
      await screen.findByRole("option", { name: "Hetzner Cloud (Хостинг)" }),
    );
    await user.type(screen.getByLabelText("Название"), "Основной Hetzner");
    await user.type(screen.getByLabelText("API-токен"), "token-value");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(credentialsMocks.create).toHaveBeenCalledTimes(1),
    );
    expect(credentialsMocks.create).toHaveBeenCalledWith({
      provider: "HETZNER_CLOUD",
      label: "Основной Hetzner",
      apiToken: "token-value",
    });
    await waitFor(() =>
      expect(apiMocks.refreshServers).toHaveBeenCalledTimes(1),
    );
  });

  it("cancels by button or Escape without an API call and restores trigger focus", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ServersView />);

    const trigger = await screen.findByRole("button", {
      name: "Перезапустить",
    });

    await user.click(trigger);
    expect(
      screen.getByRole("heading", {
        name: "Перезапустить «web-prod-01»?",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(apiMocks.powerAction).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(apiMocks.powerAction).not.toHaveBeenCalled();
  });

  it.each([
    {
      initialStatus: "stopped",
      triggerName: "Запустить",
      action: "start",
      pendingName: "Запускается…",
    },
    {
      initialStatus: "running",
      triggerName: "Остановить",
      action: "stop",
      pendingName: "Останавливается…",
    },
    {
      initialStatus: "running",
      triggerName: "Перезапустить",
      action: "restart",
      pendingName: "Перезапускается…",
    },
  ] as const)(
    "confirms $action once and leaves a focused card with a disabled pending action",
    async ({ initialStatus, triggerName, action, pendingName }) => {
      apiMocks.fetchServers.mockResolvedValueOnce({
        servers: [{ ...runningServer, status: initialStatus }],
        providerErrors: [],
      });

      const user = userEvent.setup();
      renderWithIntl(<ServersView />);

      await user.click(
        await screen.findByRole("button", { name: triggerName }),
      );
      await user.click(screen.getByRole("button", { name: "Подтвердить" }));

      const pendingButton = await screen.findByRole("button", {
        name: pendingName,
      });
      expect(pendingButton).toBeDisabled();
      expect(pendingButton.querySelector("[data-slot='spinner']")).toBeTruthy();

      await waitFor(() => {
        const card = screen.getByRole("group", {
          name: "Сервер «web-prod-01»",
        });
        expect(card.contains(document.activeElement)).toBe(true);
      });
      expect(apiMocks.powerAction).toHaveBeenCalledTimes(1);
      expect(apiMocks.powerAction).toHaveBeenCalledWith(
        "provider-1",
        "remote-1",
        action,
      );

      await user.click(pendingButton);
      expect(apiMocks.powerAction).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps provider capacity without meters while monitoring is not connected", async () => {
    renderWithIntl(<ServersView />);

    const card = await screen.findByRole("group", {
      name: "Сервер «web-prod-01»",
    });
    expect(card.querySelectorAll("[data-slot='usage-meter']")).toHaveLength(0);
    expect(screen.getByText("2 vCPU")).toBeInTheDocument();
    expect(screen.getByText("4 GB")).toBeInTheDocument();
    expect(screen.getByText("40 GB")).toBeInTheDocument();
    expect(screen.getByText("Мониторинг не подключён")).toBeInTheDocument();
  });

  it("merges live metrics into one metered resource section", async () => {
    apiMocks.fetchServers.mockResolvedValueOnce({
      servers: [
        {
          ...runningServer,
          metrics: {
            ...defaultMetrics,
            state: "live" as const,
            receivedAt: new Date(Date.now() - 19_000).toISOString(),
            cpuUsagePercent: 21.1,
            load1: 1.33,
            load5: 1.39,
            load15: 1.67,
            // 3.7 GB total, 48% of it in use.
            memoryTotalBytes: "3972844748",
            memoryAvailableBytes: "2065879269",
            // 74.8 GB total, 28.0 GB in use.
            filesystemTotalBytes: "80315888435",
            filesystemAvailableBytes: "50251117363",
            uptimeSeconds: "7466400",
          },
        },
      ],
      providerErrors: [],
    });

    renderWithIntl(<ServersView />);

    const card = await screen.findByRole("group", {
      name: "Сервер «web-prod-01»",
    });

    // One resource section, not a provider block plus a "Метрики" block.
    expect(screen.queryByText("Метрики")).not.toBeInTheDocument();
    expect(screen.getByText("21.1% · 2 vCPU")).toBeInTheDocument();
    expect(screen.getByText("1.8 / 3.7 GB · 48%")).toBeInTheDocument();
    expect(screen.getByText("28.0 / 74.8 GB · 37%")).toBeInTheDocument();
    expect(screen.getByText("1.33 / 1.39 / 1.67")).toBeInTheDocument();
    expect(screen.getByText("86d 10h")).toBeInTheDocument();
    expect(screen.getByText(/^Обновлено \d+s ago$/)).toBeInTheDocument();

    // The provider's nominal RAM and disk figures no longer duplicate the
    // agent's real totals.
    expect(screen.queryByText("4 GB")).not.toBeInTheDocument();
    expect(screen.queryByText("40 GB")).not.toBeInTheDocument();

    const meters = card.querySelectorAll("[data-slot='usage-meter']");
    expect(
      Array.from(meters).map((meter) => meter.getAttribute("data-value")),
    ).toEqual(["21.1", "48", "37"]);
    // Value text carries the number, so the meter itself stays decorative.
    expect(meters[0].getAttribute("aria-hidden")).toBe("true");

    // Both halves of the ratio are coloured: 21.1% of twenty cells is four
    // taken, and the sixteen that are left read as free rather than as blank.
    const cpuCells = Array.from(meters[0].querySelectorAll("span"));
    expect(cpuCells).toHaveLength(20);
    expect(
      cpuCells.filter((cell) => cell.className.includes("bg-primary-500")),
    ).toHaveLength(4);
    expect(
      cpuCells.filter((cell) => cell.className.includes("bg-accent-500")),
    ).toHaveLength(16);
  });

  it("forces a live provider fetch when retrying an initial failure", async () => {
    // Retrying against the cache would only replay the failed snapshot, so the
    // button has to reach the forced-refresh endpoint.
    apiMocks.fetchServers.mockReset().mockRejectedValue(new Error("offline"));
    apiMocks.refreshServers.mockReset().mockResolvedValue(composedResponse);

    const user = userEvent.setup();
    renderWithIntl(<ServersView />);

    await user.click(await screen.findByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("web-prod-01")).toBeInTheDocument();
    expect(apiMocks.refreshServers).toHaveBeenCalledTimes(1);
  });
});
