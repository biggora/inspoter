// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";

// Workspace-in-URL, Slice 3 (AC-WS-010): the switcher's entries are links to
// `/w/<other slug>/<section root>`, and creating a workspace from it navigates
// the tab to the new workspace's management page. A plain click on another
// workspace keeps the menu open (pending spinner); every click that does not
// remount this tab closes it. The default star is its own menu item.

const mocks = vi.hoisted(() => ({
  pathname: "/notes/abc",
  push: vi.fn(),
  refresh: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  setDefault: vi.fn(),
  clearDefault: vi.fn(),
}));

vi.mock("@/i18n/navigation", async () => {
  const { forwardRef } = await import("react");
  return {
    // The real wrapper renders next-intl's Link; the mock keeps what the
    // switcher hands to it observable on a plain anchor.
    Link: forwardRef<
      HTMLAnchorElement,
      {
        href: string;
        prefetch?: boolean;
        children?: React.ReactNode;
      }
    >(function MockLink({ href, prefetch, children, ...rest }, ref) {
      return (
        <a ref={ref} href={href} data-prefetch={String(prefetch)} {...rest}>
          {children}
        </a>
      );
    }),
    usePathname: () => mocks.pathname,
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  };
});

vi.mock("@/components/workspace/api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;
  }
  return {
    ApiError,
    workspacesApi: {
      list: mocks.list,
      create: mocks.create,
      setDefault: mocks.setDefault,
      clearDefault: mocks.clearDefault,
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function workspace(id: string, name: string, slug: string) {
  return { id, name, slug };
}

// jsdom cannot navigate; the default of a click on a link is cancelled after React's handlers
// have run, so the suite stays free of "not implemented: navigation" noise.
const cancelNavigation = (event: Event) => {
  if (event.target instanceof Element && event.target.closest("a")) {
    event.preventDefault();
  }
};

beforeEach(() => {
  document.addEventListener("click", cancelNavigation);
  document.addEventListener("auxclick", cancelNavigation);
  vi.clearAllMocks();
  mocks.setDefault.mockResolvedValue(undefined);
  mocks.clearDefault.mockResolvedValue(undefined);
  mocks.pathname = "/notes/abc";
  mocks.list.mockResolvedValue({
    workspaces: [
      workspace("ws-alpha", "Alpha", "alpha"),
      workspace("ws-beta", "Beta", "beta"),
    ],
    defaultWorkspaceId: null,
  });
});

async function openSwitcher() {
  const user = userEvent.setup();
  renderWithIntl(
    <WorkspaceSwitcher currentName="Alpha" currentId="ws-alpha" />,
  );
  await user.click(screen.getByRole("button", { name: "Workspace: Alpha" }));
  await screen.findByRole("menuitem", { name: "Beta" });
  return user;
}

afterEach(() => {
  document.removeEventListener("click", cancelNavigation);
  document.removeEventListener("auxclick", cancelNavigation);
});

describe("WorkspaceSwitcher entries", () => {
  it("renders every workspace as a menuitem link to the same section root, with prefetch off", async () => {
    await openSwitcher();

    for (const [name, slug] of [
      ["Alpha", "alpha"],
      ["Beta", "beta"],
    ] as const) {
      const entry = screen.getByRole("menuitem", { name });
      expect(entry).toHaveAttribute("href", `/w/${slug}/notes`);
      expect(entry).toHaveAttribute("data-prefetch", "false");
      expect(entry.tagName).toBe("A");
    }
  });

  it("uses only the first segment of the current path as the section root", async () => {
    mocks.pathname = "/settings/workspace";
    await openSwitcher();

    expect(screen.getByRole("menuitem", { name: "Beta" })).toHaveAttribute(
      "href",
      "/w/beta/settings",
    );
  });

  it("falls back to the management page when the path has no section", async () => {
    mocks.pathname = "/";
    await openSwitcher();

    expect(screen.getByRole("menuitem", { name: "Beta" })).toHaveAttribute(
      "href",
      "/w/beta/management",
    );
  });

  it("does not navigate or refresh by itself when an entry is rendered", async () => {
    await openSwitcher();

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("WorkspaceSwitcher create", () => {
  async function submitNewWorkspace(name: string) {
    const user = await openSwitcher();
    await user.click(
      screen.getByRole("menuitem", { name: "Create workspace" }),
    );
    await user.type(await screen.findByLabelText("Name"), name);
    await user.click(screen.getByRole("button", { name: "Create" }));
  }

  it("opens the new workspace's management page", async () => {
    mocks.create.mockResolvedValue(workspace("ws-gamma", "Gamma", "gamma"));

    await submitNewWorkspace("Gamma");

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/w/gamma/management"),
    );
    expect(mocks.create).toHaveBeenCalledWith("Gamma");
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("stays on the current page when the workspace cannot be created", async () => {
    mocks.create.mockRejectedValue(new Error("boom"));

    await submitNewWorkspace("Gamma");

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("WorkspaceSwitcher menu closing", () => {
  const entry = (name: string) => screen.getByRole("menuitem", { name });
  const menuClosed = () =>
    waitFor(() =>
      expect(screen.queryByRole("menuitem", { name: "Beta" })).toBeNull(),
    );

  it("stays open on a plain click on another workspace, so the pending spinner can show", async () => {
    const user = await openSwitcher();

    await user.click(entry("Beta"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(entry("Beta")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("closes on a plain click on the current workspace", async () => {
    const user = await openSwitcher();

    await user.click(entry("Alpha"));

    await menuClosed();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
  ])("closes on a %s-click on another workspace", async (_name, modifiers) => {
    await openSwitcher();

    fireEvent.click(entry("Beta"), modifiers);

    await menuClosed();
  });

  it("closes on a middle click (auxclick) on another workspace", async () => {
    await openSwitcher();

    fireEvent(
      entry("Beta"),
      new MouseEvent("auxclick", {
        bubbles: true,
        cancelable: true,
        button: 1,
      }),
    );

    await menuClosed();
  });
});

describe("WorkspaceSwitcher default star", () => {
  const row = (name: string) =>
    screen.getByRole("menuitem", { name }).parentElement as HTMLElement;

  it("is a menuitem of its own with its own name, outside the link", async () => {
    await openSwitcher();

    const link = screen.getByRole("menuitem", { name: "Beta" });
    const star = within(row("Beta")).getByRole("menuitem", {
      name: "Set as default",
    });

    expect(star).not.toBe(link);
    expect(star.tagName).not.toBe("A");
    expect(link.contains(star)).toBe(false);
    expect(star.closest("a")).toBeNull();
    // No interactive content inside the link item.
    expect(link.querySelector("a, button")).toBeNull();
    expect(within(link).queryAllByRole("button")).toHaveLength(0);
    expect(link).toHaveAccessibleName("Beta");
  });

  it("sets the default without navigating and keeps the menu open", async () => {
    const user = await openSwitcher();

    await user.click(
      within(row("Beta")).getByRole("menuitem", { name: "Set as default" }),
    );

    await waitFor(() =>
      expect(mocks.setDefault).toHaveBeenCalledWith("ws-beta"),
    );
    expect(mocks.clearDefault).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        within(row("Beta")).getByRole("menuitem", { name: "Remove default" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("menuitem", { name: "Beta" })).toBeInTheDocument();
  });

  it("clears the default when the workspace already is the default", async () => {
    mocks.list.mockResolvedValue({
      workspaces: [
        workspace("ws-alpha", "Alpha", "alpha"),
        workspace("ws-beta", "Beta", "beta"),
      ],
      defaultWorkspaceId: "ws-beta",
    });
    const user = await openSwitcher();

    await user.click(
      within(row("Beta")).getByRole("menuitem", { name: "Remove default" }),
    );

    await waitFor(() => expect(mocks.clearDefault).toHaveBeenCalledTimes(1));
    expect(mocks.setDefault).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
