// @vitest-environment jsdom

import { render, renderHook, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Link, usePathname, useRouter } from "@/i18n/navigation-client";

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string | string[] | undefined>,
  pathname: "/",
  baseRouter: {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
}));

// The raw next-intl navigation: records what the wrappers hand to it.
vi.mock("@/i18n/navigation-base", async () => {
  const { forwardRef } = await import("react");
  return {
    Link: forwardRef<
      HTMLAnchorElement,
      { href: unknown; children?: React.ReactNode; className?: string }
    >(function BaseLink({ href, children, ...rest }, ref) {
      return (
        <a ref={ref} data-href={JSON.stringify(href)} {...rest}>
          {children}
        </a>
      );
    }),
    useRouter: () => mocks.baseRouter,
    usePathname: () => mocks.pathname,
  };
});

const hrefOf = (element: HTMLElement) =>
  JSON.parse(element.getAttribute("data-href") ?? "null");

beforeEach(() => {
  mocks.params = {};
  mocks.pathname = "/";
  vi.clearAllMocks();
});

describe("Link", () => {
  it("passes href through untouched without a workspace param", () => {
    render(<Link href="/notes/1?x=1">Notes</Link>);
    expect(hrefOf(screen.getByText("Notes"))).toBe("/notes/1?x=1");
  });

  it("ignores a non-string workspace param", () => {
    mocks.params = { workspace: ["a", "b"] };
    render(<Link href="/notes">Notes</Link>);
    expect(hrefOf(screen.getByText("Notes"))).toBe("/notes");
  });

  it("prefixes a section href with the workspace slug", () => {
    mocks.params = { locale: "ru", workspace: "acme" };
    render(<Link href="/notes/1?x=1#h">Notes</Link>);
    expect(hrefOf(screen.getByText("Notes"))).toBe("/w/acme/notes/1?x=1#h");
  });

  it("prefixes an object href and keeps its query", () => {
    mocks.params = { workspace: "acme" };
    render(
      <Link href={{ pathname: "/mail", query: { account: "a1" } }}>Mail</Link>,
    );
    expect(hrefOf(screen.getByText("Mail"))).toEqual({
      pathname: "/w/acme/mail",
      query: { account: "a1" },
    });
  });

  it("leaves workspace-independent hrefs alone inside a workspace", () => {
    mocks.params = { workspace: "acme" };
    render(<Link href="/login">Login</Link>);
    expect(hrefOf(screen.getByText("Login"))).toBe("/login");
  });

  it("forwards the ref and other props", () => {
    mocks.params = { workspace: "acme" };
    const ref = createRef<HTMLAnchorElement>();
    render(
      <Link ref={ref} href="/notes" className="x">
        Notes
      </Link>,
    );
    expect(ref.current).toBe(screen.getByText("Notes"));
    expect(ref.current).toHaveClass("x");
  });
});

describe("useRouter", () => {
  it("returns the base router itself without a workspace param", () => {
    const { result } = renderHook(() => useRouter());
    expect(result.current).toBe(mocks.baseRouter);
  });

  it("prefixes push, replace and prefetch and keeps options", () => {
    mocks.params = { workspace: "acme" };
    const { result } = renderHook(() => useRouter());

    result.current.push("/notes/1?x=1", { scroll: false });
    result.current.replace({ pathname: "/mail", query: { a: "1" } });
    result.current.prefetch("/kanban");

    expect(mocks.baseRouter.push).toHaveBeenCalledWith("/w/acme/notes/1?x=1", {
      scroll: false,
    });
    expect(mocks.baseRouter.replace).toHaveBeenCalledWith(
      { pathname: "/w/acme/mail", query: { a: "1" } },
      undefined,
    );
    expect(mocks.baseRouter.prefetch).toHaveBeenCalledWith(
      "/w/acme/kanban",
      undefined,
    );
  });

  it("does not prefix workspace-independent paths", () => {
    mocks.params = { workspace: "acme" };
    const { result } = renderHook(() => useRouter());
    result.current.push("/login");
    expect(mocks.baseRouter.push).toHaveBeenCalledWith("/login", undefined);
  });

  it("passes refresh, back and forward through as-is", () => {
    mocks.params = { workspace: "acme" };
    const { result } = renderHook(() => useRouter());
    expect(result.current.refresh).toBe(mocks.baseRouter.refresh);
    expect(result.current.back).toBe(mocks.baseRouter.back);
    expect(result.current.forward).toBe(mocks.baseRouter.forward);
  });

  it("keeps a stable identity while the slug is unchanged", () => {
    mocks.params = { workspace: "acme" };
    const { result, rerender } = renderHook(() => useRouter());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("follows the slug when the workspace param changes on rerender", () => {
    mocks.params = { workspace: "acme" };
    const { result, rerender } = renderHook(() => useRouter());
    result.current.push("/notes");
    expect(mocks.baseRouter.push).toHaveBeenLastCalledWith(
      "/w/acme/notes",
      undefined,
    );

    mocks.params = { workspace: "beta" };
    rerender();
    result.current.push("/notes");
    expect(mocks.baseRouter.push).toHaveBeenLastCalledWith(
      "/w/beta/notes",
      undefined,
    );
  });
});

describe("usePathname", () => {
  it("returns the base pathname without a workspace param", () => {
    mocks.pathname = "/notes/1";
    const { result } = renderHook(() => usePathname());
    expect(result.current).toBe("/notes/1");
  });

  it("strips the workspace prefix so section highlighting still works", () => {
    mocks.params = { workspace: "acme" };
    mocks.pathname = "/w/acme/notes/1";
    const { result } = renderHook(() => usePathname());
    expect(result.current).toBe("/notes/1");
  });

  it("maps the workspace root to /", () => {
    mocks.params = { workspace: "acme" };
    mocks.pathname = "/w/acme";
    const { result } = renderHook(() => usePathname());
    expect(result.current).toBe("/");
  });
});
