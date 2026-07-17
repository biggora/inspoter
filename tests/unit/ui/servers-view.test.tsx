// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServersView } from "@/components/servers/servers-view";

const apiMocks = vi.hoisted(() => ({
  fetchServers: vi.fn(),
  getServer: vi.fn(),
  powerAction: vi.fn(),
}));

vi.mock("@/components/servers/api", () => apiMocks);

const runningServer = {
  id: "server-1",
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

const serverGroup = {
  providerId: "provider-1",
  providerType: "hetzner",
  label: "Hetzner",
  mode: "live",
  servers: [runningServer],
  error: null,
};

describe("ServersView destructive actions", () => {
  beforeEach(() => {
    apiMocks.fetchServers.mockReset().mockResolvedValue([serverGroup]);
    apiMocks.getServer.mockReset().mockResolvedValue(runningServer);
    apiMocks.powerAction.mockReset().mockResolvedValue({});
  });

  it("cancels by button or Escape without an API call and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<ServersView />);

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
      apiMocks.fetchServers.mockResolvedValueOnce([
        {
          ...serverGroup,
          servers: [{ ...runningServer, status: initialStatus }],
        },
      ]);

      const user = userEvent.setup();
      render(<ServersView />);

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
        expect(
          screen.getByRole("group", { name: "Сервер «web-prod-01»" }),
        ).toHaveFocus();
      });
      expect(apiMocks.powerAction).toHaveBeenCalledTimes(1);
      expect(apiMocks.powerAction).toHaveBeenCalledWith(
        "provider-1",
        "server-1",
        action,
      );

      await user.click(pendingButton);
      expect(apiMocks.powerAction).toHaveBeenCalledTimes(1);
    },
  );

  it("invokes the same load callback when retrying an initial failure", async () => {
    apiMocks.fetchServers
      .mockReset()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([serverGroup]);

    const user = userEvent.setup();
    render(<ServersView />);

    await user.click(await screen.findByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("web-prod-01")).toBeInTheDocument();
    expect(apiMocks.fetchServers).toHaveBeenCalledTimes(2);
  });
});
