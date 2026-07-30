import type { WeatherConfig } from "@/lib/validation/dashboards";
import type { WeatherSnapshot } from "@/lib/dashboards/widget-payloads";

// Weather for the dashboard weather widget, from Open-Meteo's free forecast API
// (no API key, no account). This is the only outbound call the Dashboards
// section makes.
//
// The endpoint is a constant and the only caller-controlled parts are two
// numbers already range-checked by weatherConfigSchema, so no operator input
// ever reaches the URL as text — there is nothing here to point at an internal
// host.
//
// Responses are cached in-process, keyed by rounded coordinates and unit: a
// dashboard polls every minute, several widgets may share a location, and the
// weather does not change that fast. The cache is deliberately per-process and
// non-persistent — losing it on restart costs one request.

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Two decimals ≈ 1 km — enough precision for a city, coarse enough to share. */
const COORDINATE_PRECISION = 2;

interface CacheEntry {
  snapshot: WeatherSnapshot;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export type { WeatherSnapshot };

export class WeatherUnavailableError extends Error {
  readonly code = "WEATHER_UNAVAILABLE" as const;
  constructor(message: string) {
    super(message);
    this.name = "WeatherUnavailableError";
  }
}

function round(value: number): number {
  const factor = 10 ** COORDINATE_PRECISION;
  return Math.round(value * factor) / factor;
}

function cacheKey(config: WeatherConfig): string {
  return `${round(config.latitude)}:${round(config.longitude)}:${config.unit}`;
}

/** Exposed for tests — the cache is process-global and would leak between them. */
export function clearWeatherCache(): void {
  cache.clear();
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
}

export async function getWeather(
  config: WeatherConfig,
): Promise<WeatherSnapshot> {
  const key = cacheKey(config);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    // The label lives on the widget, not on the reading, so a second widget at
    // the same coordinates keeps its own caption while sharing the fetch.
    return { ...cached.snapshot, label: config.label };
  }

  const params = new URLSearchParams({
    latitude: String(round(config.latitude)),
    longitude: String(round(config.longitude)),
    current:
      "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
    temperature_unit: config.unit,
  });

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Next would otherwise apply its own fetch cache to this call; the TTL
      // cache above is the one place caching should happen.
      cache: "no-store",
    });
  } catch (error) {
    throw new WeatherUnavailableError(
      error instanceof Error ? error.message : "Weather request failed",
    );
  }

  if (!response.ok) {
    throw new WeatherUnavailableError(
      `Weather provider responded with ${response.status}`,
    );
  }

  const body = (await response
    .json()
    .catch(() => null)) as OpenMeteoResponse | null;
  const current = body?.current;
  if (!current || typeof current.temperature_2m !== "number") {
    throw new WeatherUnavailableError("Weather provider returned no reading");
  }

  const snapshot: WeatherSnapshot = {
    temperature: current.temperature_2m,
    apparentTemperature:
      typeof current.apparent_temperature === "number"
        ? current.apparent_temperature
        : null,
    weatherCode:
      typeof current.weather_code === "number" ? current.weather_code : 0,
    windSpeed:
      typeof current.wind_speed_10m === "number"
        ? current.wind_speed_10m
        : null,
    isDay: current.is_day !== 0,
    unit: config.unit,
    label: config.label,
    fetchedAt: new Date(now).toISOString(),
  };

  cache.set(key, { snapshot, expiresAt: now + CACHE_TTL_MS });
  return snapshot;
}
