// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MailBody } from "@/components/mail/mail-body";
import { renderWithIntl } from "../../test-utils";

describe("MailBody", () => {
  it("preserves authored colors for branded email controls", () => {
    const { container } = renderWithIntl(
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
    renderWithIntl(<MailBody bodyText="Plain message" bodyHtml={null} />);

    expect(screen.getByText("Plain message")).toHaveClass(
      "text-foreground-800",
    );
  });

  it("explains attachment-only messages instead of rendering blank space", () => {
    renderWithIntl(<MailBody bodyText="" bodyHtml={null} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "This message has no text content.",
    );
  });

  it("blocks external resources until the operator opts in", async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <MailBody
        bodyText="Fallback"
        bodyHtml='<img src="https://tracker.example/pixel" srcset="https://tracker.example/2x 2x"><video autoplay preload="auto" poster="https://tracker.example/poster"></video>'
      />,
    );
    const image = container.querySelector("img");
    const video = container.querySelector("video");
    expect(image).not.toHaveAttribute("src");
    expect(image).not.toHaveAttribute("srcset");
    expect(video).not.toHaveAttribute("poster");

    await user.click(
      screen.getByRole("button", { name: "Load external content" }),
    );
    const loadedImage = container.querySelector("img");
    const loadedVideo = container.querySelector("video");
    expect(loadedImage).toHaveAttribute("src", "https://tracker.example/pixel");
    expect(loadedImage).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(loadedVideo).not.toHaveAttribute("autoplay");
    expect(loadedVideo).toHaveAttribute("preload", "metadata");
  });
});
