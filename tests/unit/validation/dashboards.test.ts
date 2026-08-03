import { describe, expect, it } from "vitest";

import {
  dashboardSchema,
  dashboardUpdateSchema,
  layoutSchema,
  parseWidgetConfig,
  parseWidgetConfigOrDefaults,
  readServerSelection,
  widgetCreateSchema,
  WEATHER_DEFAULT_LOCATION,
  WIDGET_CONFIG_SCHEMAS,
} from "@/lib/validation/dashboards";
import {
  GRID_MAX_WIDGET_ROWS,
  WIDGET_KIND_ORDER,
  WIDGET_KIND_SPECS,
} from "@/lib/dashboards/widget-kinds";

describe("dashboardSchema", () => {
  it("trims the name", () => {
    const parsed = dashboardSchema.safeParse({ name: "  Прод  " });
    expect(parsed.success && parsed.data.name).toBe("Прод");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(dashboardSchema.safeParse({ name: "" }).success).toBe(false);
    expect(dashboardSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name longer than 60 characters", () => {
    expect(dashboardSchema.safeParse({ name: "x".repeat(61) }).success).toBe(
      false,
    );
  });
});

describe("dashboardUpdateSchema", () => {
  it("accepts a rename, a promotion, or both", () => {
    expect(dashboardUpdateSchema.safeParse({ name: "Новый" }).success).toBe(
      true,
    );
    expect(dashboardUpdateSchema.safeParse({ isDefault: true }).success).toBe(
      true,
    );
    expect(
      dashboardUpdateSchema.safeParse({ name: "Новый", isDefault: true })
        .success,
    ).toBe(true);
  });

  it("refuses to un-set the start dashboard flag", () => {
    expect(dashboardUpdateSchema.safeParse({ isDefault: false }).success).toBe(
      false,
    );
  });
});

describe("widget config schemas", () => {
  it("covers every widget kind", () => {
    for (const kind of WIDGET_KIND_ORDER) {
      expect(WIDGET_CONFIG_SCHEMAS[kind]).toBeDefined();
    }
  });

  it("fills defaults for an empty config", () => {
    const parsed = parseWidgetConfig("CLOCK", {});
    expect(parsed.success && parsed.data).toMatchObject({
      format: "24h",
      showSeconds: false,
      showDate: true,
    });
  });

  it("treats a missing config as an empty one", () => {
    expect(parseWidgetConfig("LOGS", undefined).success).toBe(true);
  });

  it("rejects an unknown clock format", () => {
    expect(parseWidgetConfig("CLOCK", { format: "36h" }).success).toBe(false);
  });

  it("rejects an unusable time zone", () => {
    expect(
      parseWidgetConfig("CLOCK", { timeZone: "Mars/Olympus" }).success,
    ).toBe(false);
    expect(
      parseWidgetConfig("CLOCK", { timeZone: "Europe/Riga" }).success,
    ).toBe(true);
  });

  it("gives a weather widget a default location", () => {
    const parsed = parseWidgetConfig("WEATHER", {});
    expect(parsed.success && parsed.data).toEqual({
      ...WEATHER_DEFAULT_LOCATION,
      unit: "celsius",
    });
  });

  it("keeps weather coordinates in range", () => {
    expect(
      parseWidgetConfig("WEATHER", {
        label: "Рига",
        latitude: 56.95,
        longitude: 24.1,
      }).success,
    ).toBe(true);
    expect(
      parseWidgetConfig("WEATHER", {
        label: "Рига",
        latitude: 120,
        longitude: 24.1,
      }).success,
    ).toBe(false);
  });

  it("accepts a weather widget with no location, but not half of one", () => {
    expect(
      parseWidgetConfig("WEATHER", {
        label: "",
        latitude: null,
        longitude: null,
      }).success,
    ).toBe(true);
    expect(
      parseWidgetConfig("WEATHER", {
        label: "Рига",
        latitude: 56.95,
        longitude: null,
      }).success,
    ).toBe(false);
  });

  it("requires a location name once the coordinates are set", () => {
    expect(
      parseWidgetConfig("WEATHER", {
        label: "  ",
        latitude: 56.95,
        longitude: 24.1,
      }).success,
    ).toBe(false);
  });

  it("requires at least one calendar source", () => {
    expect(parseWidgetConfig("CALENDAR", { sources: [] }).success).toBe(false);
    expect(parseWidgetConfig("CALENDAR", { sources: ["mail"] }).success).toBe(
      true,
    );
  });

  it("caps the note length", () => {
    expect(parseWidgetConfig("NOTE", { text: "x".repeat(4001) }).success).toBe(
      false,
    );
  });

  it("keeps list limits between 1 and 20", () => {
    expect(parseWidgetConfig("ALERTS", { limit: 0 }).success).toBe(false);
    expect(parseWidgetConfig("ALERTS", { limit: 21 }).success).toBe(false);
    expect(parseWidgetConfig("ALERTS", { limit: 20 }).success).toBe(true);
  });

  it("drops unknown keys instead of storing them", () => {
    const parsed = parseWidgetConfig("NOTE", { text: "hi", evil: "payload" });
    expect(parsed.success && parsed.data).toEqual({ text: "hi" });
  });

  it("watches every server when no server is selected", () => {
    const parsed = parseWidgetConfig("SERVER_METRICS", {});
    expect(parsed.success && parsed.data).toEqual({
      localServerIds: [],
      limit: 5,
    });
  });

  it("lifts a pre-multi-select localServerId into the selection", () => {
    const parsed = parseWidgetConfig("SERVER_METRICS", {
      localServerId: "srv-1",
      limit: 3,
    });
    expect(parsed.success && parsed.data).toEqual({
      localServerIds: ["srv-1"],
      limit: 3,
    });
  });

  it("keeps the new selection and drops the legacy key alongside it", () => {
    const parsed = parseWidgetConfig("SERVER_METRICS", {
      localServerId: "srv-1",
      localServerIds: ["srv-2", "srv-3"],
    });
    expect(parsed.success && parsed.data).toEqual({
      localServerIds: ["srv-2", "srv-3"],
      limit: 5,
    });
  });

  it("rejects a server selection that is not a list of ids", () => {
    expect(
      parseWidgetConfig("SERVER_METRICS", { localServerIds: "srv-1" }).success,
    ).toBe(false);
  });

  it("watches every channel when neither a category nor channels are chosen", () => {
    const parsed = parseWidgetConfig("MESSAGES", {});
    expect(parsed.success && parsed.data).toEqual({
      categoryId: null,
      channelIds: [],
      unreadOnly: false,
      limit: 5,
    });
  });

  it("keeps a category alongside a channel selection", () => {
    const parsed = parseWidgetConfig("MESSAGES", {
      categoryId: "cat-1",
      channelIds: ["ch-1", "ch-2"],
      unreadOnly: true,
      limit: 10,
    });
    expect(parsed.success && parsed.data).toEqual({
      categoryId: "cat-1",
      channelIds: ["ch-1", "ch-2"],
      unreadOnly: true,
      limit: 10,
    });
  });

  it("rejects a channel selection that is not a list of ids", () => {
    expect(parseWidgetConfig("MESSAGES", { channelIds: "ch-1" }).success).toBe(
      false,
    );
  });
});

describe("readServerSelection", () => {
  it("reads both the current and the legacy shape", () => {
    expect(readServerSelection({ localServerIds: ["a", "b"] })).toEqual([
      "a",
      "b",
    ]);
    expect(readServerSelection({ localServerId: "a" })).toEqual(["a"]);
    expect(readServerSelection({ localServerId: null })).toEqual([]);
    expect(readServerSelection(undefined)).toEqual([]);
  });
});

describe("parseWidgetConfigOrDefaults", () => {
  it("falls back to defaults for a corrupt stored config", () => {
    expect(parseWidgetConfigOrDefaults("LOGS", { levels: "nope" })).toEqual({
      levels: [],
      limit: 5,
    });
    expect(
      parseWidgetConfigOrDefaults("MESSAGES", { channelIds: "nope" }),
    ).toEqual({
      categoryId: null,
      channelIds: [],
      unreadOnly: false,
      limit: 5,
    });
  });

  it("falls back to the default location for a corrupt weather config", () => {
    expect(parseWidgetConfigOrDefaults("WEATHER", { latitude: "x" })).toEqual({
      ...WEATHER_DEFAULT_LOCATION,
      unit: "celsius",
    });
  });
});

describe("widgetCreateSchema", () => {
  it("accepts a known kind with no config", () => {
    expect(widgetCreateSchema.safeParse({ kind: "CLOCK" }).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(widgetCreateSchema.safeParse({ kind: "TEAPOT" }).success).toBe(
      false,
    );
  });
});

describe("layoutSchema", () => {
  const cell = { id: "w1", x: 0, y: 0, w: 4, h: 2 };

  it("accepts a layout of legal cells", () => {
    expect(layoutSchema.safeParse({ items: [cell] }).success).toBe(true);
  });

  it("rejects an empty layout", () => {
    expect(layoutSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it("rejects out-of-grid coordinates and fractional cells", () => {
    expect(
      layoutSchema.safeParse({ items: [{ ...cell, x: 12 }] }).success,
    ).toBe(false);
    expect(
      layoutSchema.safeParse({ items: [{ ...cell, w: 13 }] }).success,
    ).toBe(false);
    expect(
      layoutSchema.safeParse({ items: [{ ...cell, y: -1 }] }).success,
    ).toBe(false);
    expect(
      layoutSchema.safeParse({ items: [{ ...cell, h: 1.5 }] }).success,
    ).toBe(false);
  });

  it("accepts every widget kind at the shared vertical resize limit", () => {
    for (const kind of WIDGET_KIND_ORDER) {
      expect(WIDGET_KIND_SPECS[kind].maxSize.h).toBe(GRID_MAX_WIDGET_ROWS);
    }
    expect(
      layoutSchema.safeParse({
        items: [{ ...cell, h: GRID_MAX_WIDGET_ROWS }],
      }).success,
    ).toBe(true);
  });
});
