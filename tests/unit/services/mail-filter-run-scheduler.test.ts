import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDueAccounts: vi.fn(),
  syncAccount: vi.fn(),
  claimRuns: vi.fn(),
  processRun: vi.fn(),
  recordFailure: vi.fn(),
  renewRun: vi.fn(),
  claimActionJobs: vi.fn(),
  processActionJob: vi.fn(),
  recordActionFailure: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { mailAccount: { findMany: mocks.findDueAccounts } },
}));
vi.mock("@/lib/services/mail-sync", () => ({
  syncAccount: mocks.syncAccount,
}));
vi.mock("@/lib/services/mail-filter-runs", () => ({
  claimMailFilterRuns: mocks.claimRuns,
  processClaimedMailFilterRunBatch: mocks.processRun,
  recordMailFilterRunFailure: mocks.recordFailure,
  renewMailFilterRunLease: mocks.renewRun,
}));
vi.mock("@/lib/services/mail-filter-action-jobs", () => ({
  claimMailFilterActionJobs: mocks.claimActionJobs,
  processClaimedMailFilterActionJob: mocks.processActionJob,
  recordMailFilterActionJobFailure: mocks.recordActionFailure,
}));

import { runMailSchedulerTick } from "@/lib/services/mail-scheduler";

describe("Mail scheduler filter-run integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDueAccounts.mockResolvedValue([
      { id: "account-1", workspaceId: "workspace-1" },
      { id: "account-2", workspaceId: "workspace-2" },
    ]);
    mocks.claimRuns.mockResolvedValue([
      { id: "run-1", leaseToken: "lease-1" },
      { id: "run-2", leaseToken: "lease-2" },
      { id: "run-3", leaseToken: "lease-3" },
    ]);
    mocks.syncAccount.mockResolvedValue(undefined);
    mocks.processRun.mockImplementation(async (claim: { id: string }) => {
      if (claim.id === "run-2") throw new Error("batch failed");
      return "COMPLETED";
    });
    mocks.recordFailure.mockResolvedValue(undefined);
    mocks.renewRun.mockResolvedValue(true);
    mocks.claimActionJobs.mockResolvedValue([]);
    mocks.processActionJob.mockResolvedValue(undefined);
    mocks.recordActionFailure.mockResolvedValue(undefined);
  });

  it("drains bounded transport actions before starting account sync", async () => {
    const order: string[] = [];
    mocks.claimActionJobs.mockResolvedValue([
      { id: "action-1", leaseToken: "action-lease-1" },
      { id: "action-2", leaseToken: "action-lease-2" },
    ]);
    mocks.processActionJob.mockImplementation(async (claim: { id: string }) => {
      order.push(claim.id);
      if (claim.id === "action-2") throw new Error("transport failed");
    });
    mocks.syncAccount.mockImplementation(async () => {
      order.push("sync");
    });

    await runMailSchedulerTick();

    expect(mocks.claimActionJobs).toHaveBeenCalledWith(3);
    expect(mocks.processActionJob).toHaveBeenCalledTimes(2);
    expect(mocks.recordActionFailure).toHaveBeenCalledWith(
      { id: "action-2", leaseToken: "action-lease-2" },
      expect.any(Error),
    );
    expect(order.indexOf("sync")).toBeGreaterThan(order.indexOf("action-1"));
  });

  it("runs the IMAP sweep with at most three one-batch run claims", async () => {
    await runMailSchedulerTick();

    expect(mocks.claimRuns).toHaveBeenCalledWith(3);
    expect(mocks.processRun).toHaveBeenCalledTimes(3);
    expect(mocks.renewRun).toHaveBeenCalledTimes(3);
    expect(mocks.syncAccount).toHaveBeenCalledTimes(2);
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      { id: "run-2", leaseToken: "lease-2" },
      expect.any(Error),
    );
  });

  it("retains a nonterminal claim and processes its next batch on the next tick", async () => {
    const claim = { id: "run-multi-batch", leaseToken: "lease-multi-batch" };
    mocks.findDueAccounts.mockResolvedValue([]);
    mocks.claimRuns.mockResolvedValueOnce([claim]).mockResolvedValueOnce([]);
    mocks.processRun
      .mockResolvedValueOnce("RUNNING")
      .mockResolvedValueOnce("COMPLETED");

    await runMailSchedulerTick();
    await runMailSchedulerTick();

    expect(mocks.claimRuns).toHaveBeenNthCalledWith(1, 3);
    expect(mocks.claimRuns).toHaveBeenNthCalledWith(2, 2);
    expect(mocks.renewRun).toHaveBeenCalledTimes(2);
    expect(mocks.processRun).toHaveBeenNthCalledWith(1, claim);
    expect(mocks.processRun).toHaveBeenNthCalledWith(2, claim);
  });
});
