// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import {
  __resetIndicatorStore,
  applyIndicators,
  type IndicatorStateDto,
} from "@/components/shell/indicator-store";
import {
  IndicatorStoreProvider,
  useIndicators,
} from "@/components/shell/indicator-store-provider";

// IndicatorStoreProvider is rendered once per `/w/<slug>` layout, keyed on the
// workspace. Rendering the provider for workspace B must not touch the module
// store: the tree for workspace A is still on screen until B commits, and a
// store write during render relabels it under A, drops A's payloads and
// notifies A's subscribers mid-render.

const WORKSPACE_A = "workspace-a";
const WORKSPACE_B = "workspace-b";

const SEED_A: IndicatorStateDto = {
  mail: 1,
  alerts: 2,
  messages: 3,
  calendar: 4,
  providersOk: 5,
  providersErrored: 0,
  openCriticalAlerts: 0,
};
const SEED_B: IndicatorStateDto = { ...SEED_A, mail: 70, alerts: 80 };

// Every text the reader rendered, committed or not.
const rendered = vi.fn<(text: string) => void>();

function Reader() {
  const indicators = useIndicators();
  const text = `${indicators.mail}/${indicators.alerts}`;
  rendered(text);
  return <output>{text}</output>;
}

function tree(workspaceId: string, initial: IndicatorStateDto) {
  return (
    <IndicatorStoreProvider
      key={workspaceId}
      workspaceId={workspaceId}
      initial={initial}
    >
      <Reader />
    </IndicatorStoreProvider>
  );
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rendered.mockClear();
  // The provider fetches on mount; a request that never settles keeps the
  // transport out of the way.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
  __resetIndicatorStore();
});

describe("IndicatorStoreProvider seeding", () => {
  it("paints the server numbers on the first render, without a flash of zeros", () => {
    const html = renderToString(tree(WORKSPACE_A, SEED_A));

    expect(html).toContain("1/2");
    expect(html).not.toContain("0/0");
  });

  it("does not change what the mounted workspace reads while another workspace's provider renders", () => {
    render(tree(WORKSPACE_A, SEED_A));
    act(() => {
      applyIndicators(WORKSPACE_A, { ...SEED_A, mail: 42 });
    });
    expect(screen.getByRole("status").textContent).toBe("42/2");

    // A render that is never committed: effects do not run.
    let html = "";
    act(() => {
      html = renderToString(tree(WORKSPACE_B, SEED_B));
    });

    // B paints its own numbers…
    expect(html).toContain("70/80");
    // …while A still reads its own, and its payloads are still accepted.
    expect(screen.getByRole("status").textContent).toBe("42/2");
    act(() => {
      applyIndicators(WORKSPACE_A, { ...SEED_A, mail: 43 });
    });
    expect(screen.getByRole("status").textContent).toBe("43/2");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("switches A to B with no setState-during-render warning and B's numbers at once", () => {
    const view = render(tree(WORKSPACE_A, SEED_A));
    act(() => {
      applyIndicators(WORKSPACE_A, { ...SEED_A, mail: 42 });
    });

    rendered.mockClear();
    view.rerender(tree(WORKSPACE_B, SEED_B));

    expect(consoleError).not.toHaveBeenCalled();
    // B never rendered A's numbers, not even for the frame before the store
    // is relabelled on commit.
    expect(rendered).toHaveBeenCalled();
    expect(rendered.mock.calls.map(([text]) => text)).not.toContain("42/2");
    expect(screen.getByRole("status").textContent).toBe("70/80");
    // The store was relabelled on commit, so B's live payloads apply and A's
    // are ignored.
    act(() => {
      applyIndicators(WORKSPACE_A, { ...SEED_A, mail: 5 });
      applyIndicators(WORKSPACE_B, { ...SEED_B, mail: 71 });
    });
    expect(screen.getByRole("status").textContent).toBe("71/80");
  });
});
