"use client";

import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import type { WeatherSnapshot } from "@/lib/dashboards/widget-payloads";

// WMO weather interpretation codes, grouped into the conditions the widget can
// name and draw. Open-Meteo returns one of these codes in `current.weather_code`
// (https://open-meteo.com/en/docs). Codes outside the table fall back to
// "unknown" rather than guessing.
const CONDITIONS: Record<number, { key: string; icon: string }> = {
  0: { key: "clear", icon: "ri-sun-line" },
  1: { key: "mainlyClear", icon: "ri-sun-cloudy-line" },
  2: { key: "partlyCloudy", icon: "ri-sun-cloudy-line" },
  3: { key: "overcast", icon: "ri-cloudy-line" },
  45: { key: "fog", icon: "ri-mist-line" },
  48: { key: "fog", icon: "ri-mist-line" },
  51: { key: "drizzle", icon: "ri-drizzle-line" },
  53: { key: "drizzle", icon: "ri-drizzle-line" },
  55: { key: "drizzle", icon: "ri-drizzle-line" },
  56: { key: "freezingDrizzle", icon: "ri-drizzle-line" },
  57: { key: "freezingDrizzle", icon: "ri-drizzle-line" },
  61: { key: "rain", icon: "ri-rainy-line" },
  63: { key: "rain", icon: "ri-rainy-line" },
  65: { key: "rain", icon: "ri-heavy-showers-line" },
  66: { key: "freezingRain", icon: "ri-hail-line" },
  67: { key: "freezingRain", icon: "ri-hail-line" },
  71: { key: "snow", icon: "ri-snowy-line" },
  73: { key: "snow", icon: "ri-snowy-line" },
  75: { key: "snow", icon: "ri-snowy-line" },
  77: { key: "snowGrains", icon: "ri-snowy-line" },
  80: { key: "showers", icon: "ri-showers-line" },
  81: { key: "showers", icon: "ri-showers-line" },
  82: { key: "showers", icon: "ri-heavy-showers-line" },
  85: { key: "snowShowers", icon: "ri-snowy-line" },
  86: { key: "snowShowers", icon: "ri-snowy-line" },
  95: { key: "thunderstorm", icon: "ri-thunderstorms-line" },
  96: { key: "thunderstormHail", icon: "ri-thunderstorms-line" },
  99: { key: "thunderstormHail", icon: "ri-thunderstorms-line" },
};

function formatTemperature(value: number, unit: string): string {
  return `${Math.round(value)}°${unit === "fahrenheit" ? "F" : "C"}`;
}

export function WeatherWidget({ data }: { data: WeatherSnapshot }) {
  const t = useTranslations("dashboards");
  const condition = CONDITIONS[data.weatherCode] ?? {
    key: "unknown",
    icon: "ri-question-line",
  };

  return (
    <div className="flex h-full items-center gap-3">
      <Icon
        name={condition.icon}
        aria-hidden
        className="shrink-0 text-3xl text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col">
        <p className="font-heading text-2xl leading-none font-semibold text-foreground-900">
          {formatTemperature(data.temperature, data.unit)}
        </p>
        <p className="truncate text-sm text-foreground-700">
          {t(`weather.conditions.${condition.key}`)}
        </p>
        <p className="truncate text-xs text-muted-foreground">{data.label}</p>
        {data.apparentTemperature !== null && (
          <p className="text-xs text-muted-foreground">
            {t("weather.feelsLike", {
              value: formatTemperature(data.apparentTemperature, data.unit),
            })}
          </p>
        )}
        {data.windSpeed !== null && (
          <p className="text-xs text-muted-foreground">
            {t("weather.wind", { value: Math.round(data.windSpeed) })}
          </p>
        )}
      </div>
    </div>
  );
}
