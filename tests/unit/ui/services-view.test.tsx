// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { ServicesView } from "@/components/services/services-view";
import type { ServiceOverviewItem } from "@/lib/services/services";

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

const apiMocks = vi.hoisted(() => ({
  checkNow: vi.fn(),
  setActive: vi.fn(),
}));

// One mock for the module the whole services cluster shares — the card, both
// dialogs and the label picker all import from it.
vi.mock("@/components/services/api", () => ({
  ApiError: class ApiError extends Error {},
  servicesApi: apiMocks,
  serviceLabelsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

const BASE_SERVICE: ServiceOverviewItem = {
  id: "svc-1",
  workspaceId: "ws-1",
  name: "Authentik",
  description: null,
  monitorType: "HTTP",
  url: "https://auth.example.com",
  host: null,
  port: null,
  expectedStatusCodes: null,
  intervalSeconds: 60,
  timeoutMs: 5000,
  retries: 1,
  isActive: true,
  currentStatus: "UP",
  consecutiveFailures: 0,
  lastCheckedAt: new Date("2026-07-27T10:00:00Z"),
  lastResponseTimeMs: 298,
  lastMessage: null,
  nextCheckAt: new Date("2026-07-27T10:01:00Z"),
  createdAt: new Date("2026-07-01T10:00:00Z"),
  updatedAt: new Date("2026-07-27T10:00:00Z"),
  labels: [],
  checks: [],
};

function renderView(overrides: Partial<ServiceOverviewItem> = {}) {
  return renderWithIntl(
    <ServicesView
      initialServices={[{ ...BASE_SERVICE, ...overrides }]}
      initialLabels={[]}
    />,
  );
}

describe("ServicesView pause control", () => {
  beforeEach(() => {
    apiMocks.checkNow.mockReset();
    apiMocks.setActive.mockReset().mockResolvedValue(undefined);
    toastMocks.success.mockReset();
    toastMocks.error.mockReset();
  });

  it("pauses an active service through the API and confirms it", async () => {
    const user = userEvent.setup();
    renderView();

    expect(screen.getByText("Работает")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Приостановить" }));

    expect(apiMocks.setActive).toHaveBeenCalledWith("svc-1", false);
    expect(toastMocks.success).toHaveBeenCalledWith("Проверки приостановлены.");
  });

  it("reports a paused service as suspended rather than as its stale last result", async () => {
    const user = userEvent.setup();
    // currentStatus stays UP in the database while the scheduler skips the
    // service — the card must not keep claiming it is up.
    renderView({ isActive: false });

    expect(screen.getByText("Приостановлен")).toBeInTheDocument();
    expect(screen.queryByText("Работает")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Возобновить" }));

    expect(apiMocks.setActive).toHaveBeenCalledWith("svc-1", true);
    expect(toastMocks.success).toHaveBeenCalledWith("Проверки возобновлены.");
  });

  it("surfaces a failed toggle on the card instead of a toast", async () => {
    const user = userEvent.setup();
    apiMocks.setActive.mockRejectedValue(new Error("Resource not found."));
    renderView();

    await user.click(screen.getByRole("button", { name: "Приостановить" }));

    expect(await screen.findByText("Resource not found.")).toBeInTheDocument();
    expect(toastMocks.success).not.toHaveBeenCalled();
  });
});
