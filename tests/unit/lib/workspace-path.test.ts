import { describe, expect, it } from "vitest";
import {
  WORKSPACE_SECTIONS,
  stripWorkspacePrefix,
  toWorkspacePath,
} from "@/lib/workspace-path";

describe("toWorkspacePath", () => {
  it("prefixes a section path and keeps query and hash", () => {
    expect(toWorkspacePath("acme", "/notes/1?x=1#h")).toBe(
      "/w/acme/notes/1?x=1#h",
    );
  });

  it.each([
    ["/notes", "/w/acme/notes"],
    ["/notes?x=1", "/w/acme/notes?x=1"],
    ["/notes#h", "/w/acme/notes#h"],
    ["/settings/api-docs", "/w/acme/settings/api-docs"],
    ["/alerts?highlightAlertId=7", "/w/acme/alerts?highlightAlertId=7"],
  ])("prefixes %s", (href, expected) => {
    expect(toWorkspacePath("acme", href)).toBe(expected);
  });

  it.each([
    "/login",
    "/login?next=%2Fnotes",
    "/no-workspace",
    "/api/notes",
    "/api/x",
    "/",
    "",
    "/notesx",
    "/w/acme/notes/1",
    "/w/other/notes",
    "https://example.com/notes",
    "http://example.com/notes",
    "//example.com/notes",
    "mailto:a@b.c",
    "?x=1",
    "#h",
    "notes",
  ])("leaves %j unchanged", (href) => {
    expect(toWorkspacePath("acme", href)).toBe(href);
  });

  it("is idempotent", () => {
    const once = toWorkspacePath("acme", "/mail?account=1");
    expect(toWorkspacePath("acme", once)).toBe(once);
  });

  it("prefixes the pathname of an object href and keeps the rest", () => {
    expect(
      toWorkspacePath("acme", {
        pathname: "/mail",
        query: { account: "a1", message: "m1" },
        hash: "top",
      }),
    ).toEqual({
      pathname: "/w/acme/mail",
      query: { account: "a1", message: "m1" },
      hash: "top",
    });
  });

  it("does not mutate the object href", () => {
    const href = { pathname: "/mail", query: { a: "1" } };
    toWorkspacePath("acme", href);
    expect(href.pathname).toBe("/mail");
  });

  it("leaves object hrefs outside the sections alone", () => {
    const login = { pathname: "/login", query: { next: "/mail" } };
    expect(toWorkspacePath("acme", login)).toEqual(login);
    const noPath = { pathname: undefined, query: { a: "1" } };
    expect(toWorkspacePath("acme", noPath)).toBe(noPath);
  });

  it("prefixes every workspace section", () => {
    for (const section of WORKSPACE_SECTIONS) {
      expect(toWorkspacePath("acme", `/${section}`)).toBe(`/w/acme/${section}`);
    }
  });
});

describe("stripWorkspacePrefix", () => {
  it.each([
    ["/w/acme/notes/1", "/notes/1"],
    ["/w/acme/notes", "/notes"],
    ["/w/acme", "/"],
    ["/w/acme/", "/"],
    ["/notes/1", "/notes/1"],
    ["/", "/"],
    ["/w", "/w"],
    ["/w/", "/w/"],
    ["/login", "/login"],
    ["/wiki/acme", "/wiki/acme"],
  ])("%s -> %s", (pathname, expected) => {
    expect(stripWorkspacePrefix(pathname)).toBe(expected);
  });

  it("is the inverse of toWorkspacePath for section paths", () => {
    for (const section of WORKSPACE_SECTIONS) {
      const path = `/${section}/1`;
      expect(stripWorkspacePrefix(toWorkspacePath("acme", path))).toBe(path);
    }
  });
});
