// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircleIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

describe("UI foundation", () => {
  it("exposes consistent control sizes", () => {
    const items = [{ label: "Alpha", value: "alpha" }];

    render(
      <>
        <Input aria-label="Small input" size="sm" />
        <Input aria-label="Large input" size="lg" />
        <NativeSelect aria-label="Native select" size="lg">
          <NativeSelectOption value="alpha">Alpha</NativeSelectOption>
        </NativeSelect>
        <Select items={items}>
          <SelectTrigger aria-label="Custom select" size="sm">
            <SelectValue />
          </SelectTrigger>
        </Select>
      </>,
    );

    expect(screen.getByLabelText("Small input")).toHaveAttribute(
      "data-size",
      "sm",
    );
    expect(screen.getByLabelText("Large input")).toHaveAttribute(
      "data-size",
      "lg",
    );
    expect(screen.getByLabelText("Native select")).toHaveAttribute(
      "data-size",
      "lg",
    );
    expect(screen.getByLabelText("Custom select")).toHaveAttribute(
      "data-size",
      "sm",
    );
  });

  it.each(["info", "success", "warning", "error", "critical"] as const)(
    "renders the %s badge variant with semantic tokens",
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>);

      const badge = screen.getByText(variant);
      expect(badge.className).toContain(`var(--${variant}-bg)`);
      expect(badge.className).toContain(`var(--${variant}-text)`);
    },
  );

  it("keeps destructive as an error-token alias", () => {
    render(<Badge variant="destructive">Error</Badge>);

    expect(screen.getByText("Error").className).toContain("var(--error-bg)");
  });

  it("supports controlled checkbox and toggle state", async () => {
    const user = userEvent.setup();

    function ControlledControls() {
      const [checked, setChecked] = useState(false);
      const [pressed, setPressed] = useState(false);

      return (
        <>
          <Checkbox
            aria-label="Enabled"
            checked={checked}
            onCheckedChange={setChecked}
          />
          <Toggle pressed={pressed} onPressedChange={setPressed}>
            Pin
          </Toggle>
        </>
      );
    }

    render(<ControlledControls />);
    const checkbox = screen.getByRole("checkbox", { name: "Enabled" });
    const toggle = screen.getByRole("button", { name: "Pin" });

    expect(checkbox).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(checkbox);
    await user.click(toggle);

    expect(checkbox).toBeChecked();
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("uses vertical arrow navigation and loops focus in a vertical toggle group", async () => {
    const user = userEvent.setup();

    render(
      <ToggleGroup orientation="vertical" aria-label="View density">
        <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
        <ToggleGroupItem value="comfortable">Comfortable</ToggleGroupItem>
        <ToggleGroupItem value="spacious">Spacious</ToggleGroupItem>
      </ToggleGroup>,
    );

    const compact = screen.getByRole("button", { name: "Compact" });
    const comfortable = screen.getByRole("button", { name: "Comfortable" });
    const spacious = screen.getByRole("button", { name: "Spacious" });

    await user.tab();
    expect(compact).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(comfortable).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(compact).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(spacious).toHaveFocus();
  });

  it("renders Lucide empty-state icons", () => {
    render(
      <EmptyState
        icon={CircleIcon}
        title="No messages"
        description="Messages will appear here."
      />,
    );

    expect(screen.getByText("No messages")).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='empty-icon'] svg"),
    ).toBeInTheDocument();
  });
});
