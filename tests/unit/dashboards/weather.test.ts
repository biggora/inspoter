import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WeatherUnavailableError,
  clearWeatherCache,
  getWeather,
} from "@/lib/dashboards/weather";
import type { WeatherConfig } from "@/lib/validation/dashboards";

const riga: WeatherConfig = {
  label: "Рига",
  latitude: 56.9496,
  longitude: 24.1052,
  unit: "celsius",
};

function okResponse(temperature: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      current: {
        temperature_2m: temperature,
        apparent_temperature: temperature - 2,
        weather_code: 3,
        wind_speed_10m: 4.2,
        is_day: 1,
      },
    }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearWeatherCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearWeatherCache();
});

describe("getWeather", () => {
  it("maps the provider reading onto a snapshot", async () => {
    fetchMock.mockResolvedValue(okResponse(12.5));

    const snapshot = await getWeather(riga);

    expect(snapshot).toMatchObject({
      temperature: 12.5,
      apparentTemperature: 10.5,
      weatherCode: 3,
      windSpeed: 4.2,
      isDay: true,
      unit: "celsius",
      label: "Рига",
    });
    expect(snapshot.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("calls Open-Meteo with the rounded coordinates and requested unit", async () => {
    fetchMock.mockResolvedValue(okResponse(1));

    await getWeather({ ...riga, unit: "fahrenheit" });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      "https://api.open-meteo.com/v1/forecast",
    );
    expect(url.searchParams.get("latitude")).toBe("56.95");
    expect(url.searchParams.get("longitude")).toBe("24.11");
    expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
  });

  it("serves a second call for the same location from the cache", async () => {
    fetchMock.mockResolvedValue(okResponse(7));

    await getWeather(riga);
    await getWeather(riga);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one fetch between two widgets but keeps each label", async () => {
    fetchMock.mockResolvedValue(okResponse(7));

    await getWeather(riga);
    const second = await getWeather({ ...riga, label: "Офис" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.label).toBe("Офис");
  });

  it("does not share the cache across units or distant coordinates", async () => {
    fetchMock.mockResolvedValue(okResponse(7));

    await getWeather(riga);
    await getWeather({ ...riga, unit: "fahrenheit" });
    await getWeather({ ...riga, latitude: 51.5 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports a transport failure as WeatherUnavailableError", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted"));

    await expect(getWeather(riga)).rejects.toBeInstanceOf(
      WeatherUnavailableError,
    );
  });

  it("reports a non-OK response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as unknown as Response);

    await expect(getWeather(riga)).rejects.toThrow(/503/);
  });

  it("reports a response without a reading", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ current: {} }),
    } as unknown as Response);

    await expect(getWeather(riga)).rejects.toBeInstanceOf(
      WeatherUnavailableError,
    );
  });

  it("does not cache a failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    fetchMock.mockResolvedValueOnce(okResponse(3));

    await expect(getWeather(riga)).rejects.toThrow();
    await expect(getWeather(riga)).resolves.toMatchObject({ temperature: 3 });
  });
});
