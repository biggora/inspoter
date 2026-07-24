// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MailBody } from "@/components/mail/mail-body";

describe("MailBody", () => {
  it("preserves authored colors for branded email controls", () => {
    const { container } = render(
      <MailBody
        bodyText="Fallback"
        bodyHtml={
          '<div style="color: rgb(255, 255, 255)"><a href="https://example.com" style="text-decoration: none; background-color: rgb(11, 87, 208); color: rgb(255, 255, 255)">Check activity</a><span style="-webkit-text-fill-color: white">nested</span><font color="white">legacy</font><script>alert(1)</script></div>'
        }
      />,
    );

    const body = container.querySelector(".mail-body-content");
    const authoredContainer = body?.querySelector("div");
    const nested = screen.getByText("nested");
    const legacy = screen.getByText("legacy");
    const link = screen.getByRole("link", { name: "Check activity" });

    expect(body).not.toBeNull();
    expect(authoredContainer).toHaveStyle({ color: "rgb(255, 255, 255)" });
    expect(link).toHaveStyle({
      backgroundColor: "rgb(11, 87, 208)",
      color: "rgb(255, 255, 255)",
      textDecoration: "none",
    });
    expect(nested).toHaveAttribute("style", "-webkit-text-fill-color: white");
    expect(legacy).toHaveAttribute("color", "white");
    expect(container.querySelector("script")).toBeNull();
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uses theme-aware text for plain-text messages", () => {
    render(<MailBody bodyText="Plain message" bodyHtml={null} />);

    expect(screen.getByText("Plain message")).toHaveClass(
      "text-foreground-800",
    );
  });
});
