import { describe, expect, it } from "vitest";

import {
  dashboardSchema,
  dashboardUpdateSchema,
  layoutSchema,
  parseWidgetConfig,
  parseWidgetConfigOrDefaults,
  widgetCreateSchema,
  WEATHER_DEFAULT_LOCATION,
  WIDGET_CONFIG_SCHEMAS,
} from "@/lib/validation/dashboards";
import { WIDGET_KIND_ORDER } from "@/lib/dashboards/widget-kinds";

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
});

describe("parseWidgetConfigOrDefaults", () => {
  it("falls back to defaults for a corrupt stored config", () => {
    expect(parseWidgetConfigOrDefaults("LOGS", { levels: "nope" })).toEqual({
      levels: [],
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
});
