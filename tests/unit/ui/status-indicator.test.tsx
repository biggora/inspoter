// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { StatusIndicator } from "@/components/ui/status-indicator";
import { renderWithIntl } from "../../test-utils";

describe("StatusIndicator", () => {
  it("labels every live state with the same word, whatever the domain", () => {
    // Services, Servers, Hosting, tokens and webhooks all map their own enum
    // onto "up" — the point of the shared vocabulary is that they cannot drift
    // into "Up" / "Running" / "Active" again.
    const { container } = renderWithIntl(
      <>
        <StatusIndicator status="up" />
        <StatusIndicator status="up" />
      </>,
    );

    const labels = [...container.querySelectorAll("[data-slot='badge']")].map(
      (badge) => badge.textContent,
    );
    expect(labels).toEqual(["Работает", "Работает"]);
  });

  it("renders the label as text so status is never colour-only", () => {
    const { container } = renderWithIntl(<StatusIndicator status="down" />);

    expect(screen.getByText("Не работает")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("animates the halo for live and transitional states only", () => {
    const { container: live } = renderWithIntl(<StatusIndicator status="up" />);
    expect(live.querySelector(".animate-status-ping")).not.toBeNull();

    const { container: moving } = renderWithIntl(
      <StatusIndicator status="restarting" />,
    );
    expect(moving.querySelector(".animate-status-ping")).not.toBeNull();

    const { container: settled } = renderWithIntl(
      <StatusIndicator status="stopped" />,
    );
    expect(settled.querySelector(".animate-status-ping")).toBeNull();
  });

  it("lets historical records opt out of the pulse", () => {
    const { container } = renderWithIntl(
      <StatusIndicator status="up" pulse={false} />,
    );

    expect(container.querySelector(".animate-status-ping")).toBeNull();
    expect(screen.getByText("Работает")).toBeInTheDocument();
  });

  it("keeps the decorative dot out of the accessible text", () => {
    const { container } = renderWithIntl(<StatusIndicator status="syncing" />);

    const badge = container.querySelector("[data-slot='badge']");
    expect(badge?.textContent).toBe("Синхронизация…");
  });
});
