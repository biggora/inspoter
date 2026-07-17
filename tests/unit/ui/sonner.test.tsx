// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/sonner";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

describe("Sonner feedback bridge", () => {
  afterEach(() => {
    toast.dismiss();
  });

  it("keeps rich colors and avoids opacity interpolation for toast content", async () => {
    render(<Toaster />);

    act(() => {
      toast.success("Success");
    });

    const title = await screen.findByText("Success");
    const toaster = document.querySelector("[data-sonner-toaster]");
    const toastElement = title.closest("[data-sonner-toast]");

    expect(toastElement).toHaveAttribute("data-rich-colors", "true");
    expect(toaster).toHaveStyle({
      "--success-text": "var(--feedback-success-text)",
    });
    expect(toastElement?.className).toContain(
      "transition-[transform,height,box-shadow]!",
    );
    expect(toastElement?.className).toContain("[&>*]:transition-none!");
  });
});
