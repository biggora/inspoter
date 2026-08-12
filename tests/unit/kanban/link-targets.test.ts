import { describe, expect, it } from "vitest";

import type { KanbanLinkType } from "@/generated/prisma/client";
import {
  KANBAN_LINK_ICONS,
  kanbanLinkHref,
  kanbanLinkTypeKey,
} from "@/lib/kanban/link-targets";
import { KANBAN_LINK_TYPES } from "@/lib/validation/kanban";

const ALL_TYPES = KANBAN_LINK_TYPES as readonly KanbanLinkType[];

describe("kanbanLinkHref", () => {
  it("points servers and services at their detail routes", () => {
    expect(kanbanLinkHref("SERVER", "srv-1")).toBe("/servers/srv-1");
    expect(kanbanLinkHref("SERVICE", "svc-1")).toBe("/services/svc-1");
  });

  // Domains, alerts and hosting accounts have no detail route, so the chip
  // links to the section index rather than to a page that does not exist.
  it("points the rest at their section index", () => {
    expect(kanbanLinkHref("DOMAIN", "d-1")).toBe("/domains");
    expect(kanbanLinkHref("ALERT", "a-1")).toBe("/alerts");
    expect(kanbanLinkHref("HOSTING_ACCOUNT", "h-1")).toBe("/hosting");
  });

  it("resolves every link type to an absolute in-app path", () => {
    for (const type of ALL_TYPES) {
      expect(kanbanLinkHref(type, "x")).toMatch(/^\//);
    }
  });
});

describe("KANBAN_LINK_ICONS", () => {
  it("covers every link type with a Remix -line glyph", () => {
    for (const type of ALL_TYPES) {
      expect(KANBAN_LINK_ICONS[type]).toMatch(/^ri-[a-z0-9-]+-line$/);
    }
  });
});

describe("kanbanLinkTypeKey", () => {
  it("builds the namespace-relative i18n key", () => {
    expect(kanbanLinkTypeKey("SERVER")).toBe("linkTypes.SERVER");
  });
});
