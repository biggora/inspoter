// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MailBody } from "@/components/mail/mail-body";

describe("MailBody", () => {
  it("removes authored foreground colors so the theme controls contrast", () => {
    const { container } = render(
      <MailBody
        bodyText="Fallback"
        bodyHtml={
          '<p style="color: #000 !important; background-color: #eee">Readable <span style="-webkit-text-fill-color: black">nested</span> <font color="black">legacy</font> <a href="https://example.com">link</a><script>alert(1)</script></p>'
        }
      />,
    );

    const body = container.querySelector(".mail-body-content");
    const paragraph = container.querySelector("p");
    const nested = screen.getByText("nested");
    const legacy = screen.getByText("legacy");

    expect(body).not.toBeNull();
    expect(paragraph).not.toBeNull();
    expect((paragraph as HTMLElement).style.color).toBe("");
    expect(paragraph).toHaveStyle({ backgroundColor: "#eee" });
    expect(nested.getAttribute("style")).toBeNull();
    expect(legacy).not.toHaveAttribute("color");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("uses theme-aware text for plain-text messages", () => {
    render(<MailBody bodyText="Plain message" bodyHtml={null} />);

    expect(screen.getByText("Plain message")).toHaveClass(
      "text-foreground-800",
    );
  });
});
