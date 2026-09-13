// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";

import { MailBody } from "@/components/mail/mail-body";
import { renderWithIntl } from "../../test-utils";

describe("MailBody", () => {
  it("hides legacy C1 controls while preserving Baltic text and line breaks", async () => {
    // Minimal reproduction of the LMT message's declared charset and bytes.
    const parsed = await simpleParser(
      Buffer.from(
        'Content-Type: text/plain; charset="ISO-8859-13"\r\n' +
          "Content-Transfer-Encoding: quoted-printable\r\n\r\n" +
          "Hello!=0A=0A=84LMT elektroniskais r=E7=EDins=94 =96 J=FBsu izv=E7le.",
      ),
    );
    const bodyText = parsed.text ?? "";
    expect(bodyText).toContain("\u0084");
    expect(parsed.html).toBe(false);
    renderWithIntl(<MailBody bodyText={bodyText} bodyHtml={null} />);

    expect(screen.getByRole("region").textContent).toBe(
      "Hello!\n\nLMT elektroniskais rēķins  Jūsu izvēle.",
    );
  });

  it("links plain-text email addresses without swallowing punctuation or markup", () => {
    const { container } = renderWithIntl(
      <MailBody
        bodyText={
          "Email: reader@example.com.\n<admin+mail@example.co.uk> <img src=x onerror=alert(1)>"
        }
        bodyHtml={null}
      />,
    );

    expect(
      screen.getByRole("link", { name: "reader@example.com" }),
    ).toHaveAttribute("href", "mailto:reader@example.com");
    expect(
      screen.getByRole("link", { name: "admin+mail@example.co.uk" }),
    ).toHaveAttribute("href", "mailto:admin+mail@example.co.uk");
    expect(screen.getByRole("region").textContent).toBe(
      "Email: reader@example.com.\n<admin+mail@example.co.uk> <img src=x onerror=alert(1)>",
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("links web addresses and preserves surrounding punctuation", () => {
    const bodyText =
      "See (https://example.com/bill?id=42&lang=lv), http://example.org.\nwww.example.com and lmt.lv; ftp://example.com/file.";
    renderWithIntl(<MailBody bodyText={bodyText} bodyHtml={null} />);

    expect(screen.getByRole("region").textContent).toBe(bodyText);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "https://example.com/bill?id=42&lang=lv",
      "http://example.org",
      "http://www.example.com",
      "http://lmt.lv",
      "ftp://example.com/file",
    ]);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("keeps executable schemes inert", () => {
    renderWithIntl(
      <MailBody
        bodyText="javascript:alert(1) data:text/html,<script>alert(1)</script>"
        bodyHtml={null}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

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
