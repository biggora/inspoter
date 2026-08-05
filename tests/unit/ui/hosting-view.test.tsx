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
  databaseDiskUsedMb: null,
  emailAccounts: 5,
  emailAccountsLimit: null,
  phpVersion: null,
  wordpressVersion: null,
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
      name: 'Hosting account "example.ru"',
    });
    expect(screen.getByText("5.0 GB / 10.0 GB · 50%")).toBeInTheDocument();

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
      name: 'Hosting account "example.ru"',
    });
    expect(card.querySelectorAll("[data-slot='usage-meter']")).toHaveLength(0);
  });
});

describe("HostingView provider-specific rows", () => {
  beforeEach(() => {
    apiMocks.fetchAccounts.mockReset();
    apiMocks.getAccount.mockReset();
    apiMocks.setSuspended.mockReset();
  });

  it("omits the PHP and WordPress rows when the provider reports neither", async () => {
    respondWith();
    renderWithIntl(<HostingView />);

    await screen.findByRole("group", { name: 'Hosting account "example.ru"' });
    expect(screen.queryByText("PHP")).not.toBeInTheDocument();
    expect(screen.queryByText("WordPress")).not.toBeInTheDocument();
  });

  it("renders the PHP and WordPress rows once the versions are known", async () => {
    respondWith({ phpVersion: "8.3", wordpressVersion: "6.8.1" });
    renderWithIntl(<HostingView />);

    await screen.findByRole("group", { name: 'Hosting account "example.ru"' });
    expect(screen.getByText("PHP")).toBeInTheDocument();
    expect(screen.getByText("8.3")).toBeInTheDocument();
    expect(screen.getByText("WordPress")).toBeInTheDocument();
    expect(screen.getByText("6.8.1")).toBeInTheDocument();
  });

  it("states mailboxes against the seats the plan pays for", async () => {
    respondWith({ emailAccounts: 3, emailAccountsLimit: 5 });
    renderWithIntl(<HostingView />);

    await screen.findByRole("group", { name: 'Hosting account "example.ru"' });
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  it("carries the database size in the database count row", async () => {
    respondWith({ databases: 2, databaseDiskUsedMb: 48 });
    renderWithIntl(<HostingView />);

    await screen.findByRole("group", { name: 'Hosting account "example.ru"' });
    expect(screen.getByText("2 · 48 MB")).toBeInTheDocument();
  });
});
