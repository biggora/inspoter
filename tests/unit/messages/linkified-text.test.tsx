// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkifiedText } from "@/components/messages/linkified-text";

describe("LinkifiedText", () => {
  it("turns http(s) URLs into new-tab links and keeps surrounding text", () => {
    const text =
      "Status: done.\nhttps://paper.inspotstore.com/CEN/issues/CEN-54 ok";
    const { container } = render(<LinkifiedText text={text} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "https://paper.inspotstore.com/CEN/issues/CEN-54",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toBe(text);
  });

  it("does not link non-http schemes or plain text", () => {
    render(<LinkifiedText text="mail me@example.com, no links here" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
