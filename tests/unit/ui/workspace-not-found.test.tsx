// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import WorkspaceNotFound from "@/app/[locale]/(dashboard)/w/not-found";
import { WorkspaceNotFoundHeading } from "@/components/shell/workspace-not-found-heading";

// AC-WS-013 (design.md §4.2): the unknown-or-foreign workspace page has a
// level-1 heading that takes focus on render, a link back to `/`, and no shell.

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("WorkspaceNotFoundHeading", () => {
  it("moves focus to the heading on render", () => {
    render(
      <WorkspaceNotFoundHeading>Workspace not found</WorkspaceNotFoundHeading>,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Workspace not found",
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
  });
});

describe("workspace not-found page", () => {
  it("renders the focused heading and a link to / without any navigation landmark", async () => {
    render(await WorkspaceNotFound());

    // getTranslations is mocked to return the key, so the keys prove which
    // localized strings the page asks for.
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "workspaceNotFoundTitle",
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText("workspaceNotFoundDescription")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "workspaceNotFoundAction" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
