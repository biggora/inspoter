// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { HostingView } from "@/components/hosting/hosting-view";
import type { HostingAccountDto } from "@/components/hosting/api";

const apiMocks = vi.hoisted(() => ({
  fetchAccounts: vi.fn(),
  getAccount: vi.fn(),
  setSuspended: vi.fn(),
}));

vi.mock("@/components/hosting/api", () => apiMocks);

const account: HostingAccountDto = {
  id: "acc-1",
  domain: "example.ru",
  user: "example",
  plan: "Business",
  status: "active",
  ip: "203.0.113.10",
  diskUsedMb: 5120,
  diskLimitMb: 10240,
  bandwidthUsedMb: null,
  bandwidthLimitMb: null,
  databases: 3,
  emailAccounts: 5,
  expiresAt: null,
  supportsSuspend: true,
};

function respondWith(overrides: Partial<HostingAccountDto> = {}) {
  apiMocks.fetchAccounts.mockResolvedValue([
    {
      providerId: "provider-1",
      providerType: "cpanel",
      label: "cPanel",
      mode: "real",
      accounts: [{ ...account, ...overrides }],
      error: null,
    },
  ]);
}

describe("HostingView quota meters", () => {
  beforeEach(() => {
    apiMocks.fetchAccounts.mockReset();
    apiMocks.getAccount.mockReset();
    apiMocks.setSuspended.mockReset();
  });

  it("meters a capped quota and states its percentage", async () => {
    respondWith();
    renderWithIntl(<HostingView />);

    const card = await screen.findByRole("group", {
      name: "Хостинг-аккаунт «example.ru»",
    });
    expect(screen.getByText("5.0 ГБ / 10.0 ГБ · 50%")).toBeInTheDocument();

    const meters = card.querySelectorAll("[data-slot='usage-meter']");
    expect(meters).toHaveLength(1);
    expect(meters[0].getAttribute("data-value")).toBe("50");
    // Half the cells taken, half free — the free half is coloured, not blank.
    const cells = meters[0].querySelectorAll("span");
    expect(cells).toHaveLength(20);
    expect(
      Array.from(cells).filter((cell) =>
        cell.className.includes("bg-primary-500"),
      ),
    ).toHaveLength(10);
    expect(
      Array.from(cells).filter((cell) =>
        cell.className.includes("bg-accent-500"),
      ),
    ).toHaveLength(10);
  });

  it("leaves an unlimited quota unmetered", async () => {
    respondWith({ diskUsedMb: 5120, diskLimitMb: null });
    renderWithIntl(<HostingView />);

    const card = await screen.findByRole("group", {
      name: "Хостинг-аккаунт «example.ru»",
    });
    expect(card.querySelectorAll("[data-slot='usage-meter']")).toHaveLength(0);
  });
});
