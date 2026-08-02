// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { MessageEmbeds } from "@/components/messages/message-embed";
import type { MessageEmbedDto } from "@/components/messages/api";
import { renderWithIntl } from "../../test-utils";

// Embed cards render sender-supplied data straight from a public webhook, so
// the interesting cases are the hostile ones: unusable colours, non-http URLs
// and broken timestamps must degrade instead of leaking into href/src.

const FULL: MessageEmbedDto = {
  title: "Build 842",
  description: "All checks passed.",
  url: "https://ci.example.test/builds/842",
  color: 0x57f287,
  author: { name: "Continuous Integration" },
  footer: { text: "Inspoter" },
  timestamp: "2026-08-02T10:15:00.000Z",
  fields: [
    { name: "branch", value: "main", inline: true },
    { name: "commit", value: "a1b2c3d", inline: false },
  ],
};

describe("MessageEmbeds", () => {
  it("renders nothing for an absent or empty list", () => {
    const { container: absent } = renderWithIntl(
      <MessageEmbeds embeds={null} />,
    );
    expect(absent.innerHTML).toBe("");

    const { container: empty } = renderWithIntl(<MessageEmbeds embeds={[]} />);
    expect(empty.innerHTML).toBe("");
  });

  it("renders every part of a full embed", () => {
    renderWithIntl(<MessageEmbeds embeds={[FULL]} />);

    expect(screen.getByText("Build 842")).toBeInTheDocument();
    expect(screen.getByText("All checks passed.")).toBeInTheDocument();
    expect(screen.getByText("Continuous Integration")).toBeInTheDocument();
    expect(screen.getByText("Inspoter")).toBeInTheDocument();
    expect(screen.getByText("branch")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("commit")).toBeInTheDocument();
  });

  it("renders one card per embed", () => {
    renderWithIntl(
      <MessageEmbeds embeds={[{ title: "one" }, { title: "two" }]} />,
    );
    expect(screen.getAllByTestId("message-embed")).toHaveLength(2);
  });

  it("paints the accent bar from the Discord colour integer", () => {
    const { container } = renderWithIntl(
      <MessageEmbeds embeds={[{ title: "t", color: 0x57f287 }]} />,
    );
    const bar = container.querySelector<HTMLElement>("[aria-hidden='true']");
    expect(bar?.style.backgroundColor).toBe("rgb(87, 242, 135)");
  });

  it("falls back to a neutral bar when the colour is missing or unusable", () => {
    for (const color of [undefined, Number.NaN]) {
      const { container } = renderWithIntl(
        <MessageEmbeds embeds={[{ title: "t", color }]} />,
      );
      const bar = container.querySelector<HTMLElement>("[aria-hidden='true']");
      // jsdom drops a var() background-color, so the assertion is that it is
      // *not* the literal hex a real colour would produce.
      expect(bar?.style.backgroundColor).not.toMatch(/^rgb\(/);
    }
  });

  it("links the title only for an http(s) url", () => {
    const { container: linked } = renderWithIntl(
      <MessageEmbeds embeds={[FULL]} />,
    );
    expect(linked.querySelector("a")?.getAttribute("href")).toBe(FULL.url);
    expect(linked.querySelector("a")?.getAttribute("rel")).toContain(
      "noopener",
    );

    const { container: unsafe } = renderWithIntl(
      <MessageEmbeds
        embeds={[{ title: "Build 842", url: "javascript:alert(1)" }]}
      />,
    );
    expect(unsafe.querySelector("a")).toBeNull();
    expect(screen.getAllByText("Build 842").length).toBeGreaterThan(0);
  });

  it("renders an image only for an http(s) url", () => {
    const { container: safe } = renderWithIntl(
      <MessageEmbeds
        embeds={[
          { title: "t", image: { url: "https://img.example.test/a.png" } },
        ]}
      />,
    );
    expect(safe.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.example.test/a.png",
    );

    const { container: unsafe } = renderWithIntl(
      <MessageEmbeds
        embeds={[{ title: "t", image: { url: "data:image/png;base64,AAA" } }]}
      />,
    );
    expect(unsafe.querySelector("img")).toBeNull();
  });

  it("drops an unparseable timestamp instead of rendering Invalid Date", () => {
    const { container } = renderWithIntl(
      <MessageEmbeds embeds={[{ title: "t", timestamp: "not-a-date" }]} />,
    );
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).not.toContain("Invalid");
  });
});
