// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";

import {
  __resetIndicatorStore,
  applyIndicators,
  resetIndicators,
  seedIndicators,
  useIndicators,
  type IndicatorStateDto,
} from "@/components/shell/indicator-store";

const WORKSPACE_A = "workspace-a";
const WORKSPACE_B = "workspace-b";

const SEED: IndicatorStateDto = {
  mail: 1,
  alerts: 2,
  messages: 3,
  calendar: 4,
  providersOk: 5,
  providersErrored: 0,
  openCriticalAlerts: 0,
};

afterEach(() => {
  __resetIndicatorStore();
});

// Counted in an effect rather than during render: reassigning a module
// variable mid-render is the side effect react-hooks/globals rightly rejects,
// and an effect still runs once per committed render, which is what these
// assertions are about.
let renders = 0;

function Probe({ seed }: { seed: IndicatorStateDto }) {
  const indicators = useIndicators(seed);
  useEffect(() => {
    renders += 1;
  });
  return <output>{`${indicators.mail}/${indicators.alerts}`}</output>;
}

function renderProbe(seed: IndicatorStateDto = SEED) {
  renders = 0;
  return render(<Probe seed={seed} />);
}

describe("indicator store", () => {
  it("falls back to the server seed until the store is populated", () => {
    renderProbe();
    expect(screen.getByRole("status").textContent).toBe("1/2");
  });

  it("re-renders subscribers when the numbers change", () => {
    renderProbe();

    act(() => {
      seedIndicators(WORKSPACE_A, SEED);
      applyIndicators(WORKSPACE_A, { ...SEED, mail: 9 });
    });

    expect(screen.getByRole("status").textContent).toBe("9/2");
  });

  // The useSyncExternalStore footgun: a poll returning the same numbers must
  // not repaint the whole shell on every tick.
  it("does not notify when an identical payload arrives", () => {
    renderProbe();
    act(() => {
      seedIndicators(WORKSPACE_A, SEED);
    });
    const before = renders;

    act(() => {
      applyIndicators(WORKSPACE_A, { ...SEED });
    });

    expect(renders).toBe(before);
  });

  it("ignores a payload addressed to a workspace the tab has left", () => {
    renderProbe();
    act(() => {
      seedIndicators(WORKSPACE_A, SEED);
      applyIndicators(WORKSPACE_B, { ...SEED, mail: 99 });
    });

    expect(screen.getByRole("status").textContent).toBe("1/2");
  });

  it("replaces everything on a workspace switch", () => {
    renderProbe();
    act(() => {
      seedIndicators(WORKSPACE_A, SEED);
      applyIndicators(WORKSPACE_A, { ...SEED, mail: 42 });
    });
    expect(screen.getByRole("status").textContent).toBe("42/2");

    act(() => {
      resetIndicators(WORKSPACE_B, { ...SEED, mail: 0, alerts: 0 });
    });

    expect(screen.getByRole("status").textContent).toBe("0/0");
  });

  // Seeding twice for the same workspace (every layout render) must not throw
  // away numbers the store has since received from the stream.
  it("keeps live values when the same workspace is seeded again", () => {
    renderProbe();
    act(() => {
      seedIndicators(WORKSPACE_A, SEED);
      applyIndicators(WORKSPACE_A, { ...SEED, mail: 7 });
      seedIndicators(WORKSPACE_A, SEED);
    });

    expect(screen.getByRole("status").textContent).toBe("7/2");
  });

  it("is a no-op on the server, so nothing leaks between SSR requests", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error — deleting the jsdom window to simulate the server.
    delete globalThis.window;
    try {
      seedIndicators(WORKSPACE_A, { ...SEED, mail: 123 });
    } finally {
      globalThis.window = originalWindow;
    }

    renderProbe();
    expect(screen.getByRole("status").textContent).toBe("1/2");
  });
});

describe("indicator store transport wiring", () => {
  it("refreshes through the workspace-scoped endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...SEED, mail: 11 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchIndicators } =
      await import("@/components/shell/indicator-store");

    await expect(fetchIndicators()).resolves.toMatchObject({ mail: 11 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/indicators",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    vi.unstubAllGlobals();
  });
});
