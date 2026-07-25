// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusIndicator } from "@/components/ui/status-indicator";

describe("StatusIndicator", () => {
  it("renders the label as text so status is never colour-only", () => {
    const { container } = render(
      <StatusIndicator variant="success" label="Работает" pulse />,
    );

    expect(screen.getByText("Работает")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("animates the halo only when pulse is requested", () => {
    const { container: live } = render(
      <StatusIndicator variant="success" label="Работает" pulse />,
    );
    expect(live.querySelector(".animate-status-ping")).not.toBeNull();

    const { container: idle } = render(
      <StatusIndicator variant="secondary" label="Остановлен" />,
    );
    expect(idle.querySelector(".animate-status-ping")).toBeNull();
  });

  it("keeps the decorative dot out of the accessible text", () => {
    const { container } = render(
      <StatusIndicator variant="warning" label="Запускается" pulse />,
    );

    const badge = container.querySelector("[data-slot='badge']");
    expect(badge?.textContent).toBe("Запускается");
  });
});
