import { ServiceStatus } from "@/generated/prisma/client";

// Pure, dependency-free status-flip logic for Services monitoring
// (plan.md "Логика проверок"). Kept separate from services.ts so it's
// trivially unit-testable without touching Prisma.

export interface CurrentState {
  status: ServiceStatus;
  consecutiveFailures: number;
}

export interface CheckOutcomeOk {
  ok: boolean;
}

export interface NextStateResult {
  status: ServiceStatus;
  consecutiveFailures: number;
  flipped: boolean;
}

// `flipped` is true only when the *previous* status was already UP or DOWN
// and the newly resolved status differs from it — a PENDING service's
// first observation (whichever way it resolves, including a PENDING→DOWN
// via the retries threshold on its very first checks) is never a flip, so
// no Alert is created when a brand-new service is first observed.
export function nextState(
  current: CurrentState,
  outcome: CheckOutcomeOk,
  retries: number,
): NextStateResult {
  if (outcome.ok) {
    return {
      status: ServiceStatus.UP,
      consecutiveFailures: 0,
      flipped: current.status === ServiceStatus.DOWN,
    };
  }

  const consecutiveFailures = current.consecutiveFailures + 1;
  if (consecutiveFailures >= retries) {
    return {
      status: ServiceStatus.DOWN,
      consecutiveFailures,
      flipped: current.status === ServiceStatus.UP,
    };
  }

  return { status: current.status, consecutiveFailures, flipped: false };
}
