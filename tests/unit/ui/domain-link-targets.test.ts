import { describe, expect, it } from "vitest";

import {
  buildLinkedIndex,
  domainLinkTarget,
  lookupLinkedState,
  normalizeHost,
  recordLinkTarget,
  toFqdn,
} from "@/components/domains/link-targets";
import type { Bookmark, Service } from "@/generated/prisma/client";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";

function bookmark(id: string, url: string): Bookmark {
  return {
    id,
    workspaceId: "ws-1",
    categoryId: "cat-1",
    categoryWorkspaceId: "ws-1",
    name: id,
    url,
    icon: null,
    color: null,
    description: null,
    position: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function category(
  id: string,
  bookmarks: Bookmark[],
  childCategories: CategoryWithBookmarks["childCategories"] = [],
): CategoryWithBookmarks {
  return {
    id,
    workspaceId: "ws-1",
    name: id,
    parentCategoryId: null,
    parentCategoryWorkspaceId: null,
    position: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    bookmarks,
    childCategories,
  } as CategoryWithBookmarks;
}

type ServiceRow = Pick<Service, "id" | "monitorType" | "url" | "host">;

describe("toFqdn", () => {
  it.each([
    ["@", "example.com", "example.com"],
    ["", "example.com", "example.com"],
    ["www", "example.com", "www.example.com"],
    ["www.example.com", "example.com", "www.example.com"],
    ["example.com", "example.com", "example.com"],
    ["WWW", "Example.COM", "www.example.com"],
    ["www.example.com.", "example.com.", "www.example.com"],
    ["api.staging", "example.com", "api.staging.example.com"],
  ])("resolves %s in %s to %s", (name, domain, expected) => {
    expect(toFqdn(name, domain)).toBe(expected);
  });
});

describe("domainLinkTarget", () => {
  it("offers both an https bookmark and an HTTP monitor", () => {
    expect(domainLinkTarget("Example.com")).toEqual({
      label: "example.com",
      bookmark: { name: "example.com", url: "https://example.com" },
      monitor: {
        name: "example.com",
        monitorType: "HTTP",
        url: "https://example.com",
      },
    });
  });
});

describe("recordLinkTarget", () => {
  it("maps A/AAAA/CNAME to an https target on the record's FQDN", () => {
    const target = recordLinkTarget(
      { type: "CNAME", name: "www", value: "example.com" },
      "example.com",
    );
    expect(target.bookmark).toEqual({
      name: "www.example.com",
      url: "https://www.example.com",
    });
    expect(target.monitor).toEqual({
      name: "www.example.com",
      monitorType: "HTTP",
      url: "https://www.example.com",
    });
  });

  it("maps MX to a PING monitor on the mail host from the value", () => {
    const target = recordLinkTarget(
      { type: "MX", name: "@", value: "10 mail.example.com." },
      "example.com",
    );
    expect(target.bookmark).toBeNull();
    expect(target.monitor).toEqual({
      name: "mail.example.com",
      monitorType: "PING",
      host: "mail.example.com",
    });
  });

  it("offers nothing for records without a reachable target", () => {
    const target = recordLinkTarget(
      { type: "TXT", name: "@", value: "v=spf1 -all" },
      "example.com",
    );
    expect(target).toEqual({ label: "@", bookmark: null, monitor: null });
  });
});

describe("normalizeHost", () => {
  it.each([
    ["https://Example.com/path?q=1", "example.com"],
    ["example.com.", "example.com"],
    ["http://sub.example.com:8080", "sub.example.com"],
    [" ", null],
    [null, null],
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeHost(value)).toBe(expected);
  });
});

describe("buildLinkedIndex", () => {
  const categories = [
    category("cat-1", [bookmark("bm-1", "https://example.com/dashboard")], [
      {
        ...category("cat-2", [bookmark("bm-2", "https://www.example.com")]),
        parentCategoryId: "cat-1",
      },
    ] as CategoryWithBookmarks["childCategories"]),
  ];
  const services: ServiceRow[] = [
    {
      id: "svc-http",
      monitorType: "HTTP",
      url: "https://example.com",
      host: null,
    },
    {
      id: "svc-ping",
      monitorType: "PING",
      url: null,
      host: "mail.example.com",
    },
  ];

  it("indexes bookmarks from every category level and services by probe host", () => {
    const index = buildLinkedIndex(categories, services);

    expect(index.get("example.com")).toEqual({
      bookmarkId: "bm-1",
      serviceId: "svc-http",
    });
    expect(index.get("www.example.com")).toEqual({
      bookmarkId: "bm-2",
      serviceId: null,
    });
    expect(index.get("mail.example.com")).toEqual({
      bookmarkId: null,
      serviceId: "svc-ping",
    });
  });

  it("keeps www and the apex as distinct targets", () => {
    const index = buildLinkedIndex(categories, services);
    expect(
      lookupLinkedState(index, domainLinkTarget("www.example.com")).serviceId,
    ).toBeNull();
  });

  it("reports an unknown target as unlinked", () => {
    const index = buildLinkedIndex(categories, services);
    expect(lookupLinkedState(index, domainLinkTarget("other.dev"))).toEqual({
      bookmarkId: null,
      serviceId: null,
    });
  });
});
