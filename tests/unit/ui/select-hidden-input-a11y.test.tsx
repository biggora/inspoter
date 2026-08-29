// @vitest-environment jsdom

// Guards the 2026-08-29 critique finding "hidden native select inputs expose
// unlabeled values": Base UI's Select renders an internal <input> that must
// stay out of the accessibility tree (aria-hidden) and the tab order
// (tabindex -1). If a Base UI upgrade regresses either attribute, keyboard
// operators gain a stop and screen readers announce raw values ("all",
// category IDs, account UUIDs) as unnamed textboxes.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

describe("Select internal hidden input accessibility", () => {
  it("is aria-hidden and removed from the tab order", () => {
    const { container } = render(
      <Select value="a" onValueChange={() => {}} items={{ a: "Alpha", b: "Beta" }}>
        <SelectTrigger aria-label="Pick one">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="a">Alpha</SelectItem>
            <SelectItem value="b">Beta</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    const internalInputs = Array.from(container.querySelectorAll("input"));
    expect(internalInputs.length).toBeGreaterThan(0);
    for (const input of internalInputs) {
      expect(input.getAttribute("aria-hidden")).toBe("true");
      expect(input.getAttribute("tabindex")).toBe("-1");
    }
  });
});
