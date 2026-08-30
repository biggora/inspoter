// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InspoterIcon } from "@/components/ui/inspoter-logo";

describe("InspoterIcon", () => {
  it("wraps primary color channels in a valid OKLCH color", () => {
    const { container } = render(<InspoterIcon />);

    expect(
      [...container.querySelectorAll("g")].map((group) =>
        group.getAttribute("fill"),
      ),
    ).toEqual([
      "oklch(var(--primary-600))",
      "oklch(var(--primary-800))",
      "oklch(var(--primary-200))",
    ]);
  });
});
