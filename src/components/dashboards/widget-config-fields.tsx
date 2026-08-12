"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { DashboardWidgetKind } from "@/generated/prisma/client";
import {
  ALERT_SEVERITIES,
  CALENDAR_EVENT_SOURCES,
  LOG_LEVELS,
  readServerSelection,
  type CalendarEventSource,
} from "@/lib/validation/dashboards";
import type { WidgetTargets } from "@/lib/services/dashboard-widget-targets";

// One settings form per widget kind. Every form edits a plain object that is
// posted verbatim to PATCH …/widgets/:id, where the kind's Zod schema is the
// authority — these components never re-implement validation, they only offer
// the choices the schema accepts.
//
// Kinds whose options are all covered by the shared title field (currently none
// beyond the title itself) still render, so "Configure" is never a dead action.

type ConfigRecord = Record<string, unknown>;

export interface WidgetConfigFieldsProps {
  kind: DashboardWidgetKind;
  config: ConfigRecord;
  onChange: (patch: ConfigRecord) => void;
  targets: WidgetTargets;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A number field that may legitimately be empty — the weather coordinates. */
function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function toggle(current: string[], value: string, on: boolean): string[] {
  const set = new Set(current);
  if (on) set.add(value);
  else set.delete(value);
  return [...set];
}

/** The "how many entries" field shared by every list-style widget. */
function LimitField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (limit: number) => void;
}) {
  const t = useTranslations("dashboards");
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("limitLabel")}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={1}
        max={20}
        value={num(value, 5)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

/** Optional per-widget heading, offered for every kind. */
function TitleField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (title: string) => void;
}) {
  const t = useTranslations("dashboards");
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("titleLabel")}</FieldLabel>
      <Input
        id={id}
        value={str(value)}
        placeholder={t("titlePlaceholder")}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function TargetSelect({
  label,
  allOption,
  options,
  value,
  onChange,
}: {
  label: string;
  allOption: string;
  options: { id: string; name: string }[];
  value: unknown;
  onChange: (id: string | null) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        value={str(value)}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full"
      >
        <NativeSelectOption value="">{allOption}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function CheckboxList({
  legend,
  hint,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string, on: boolean) => void;
}) {
  const idPrefix = useId();
  return (
    <Field>
      <FieldLabel>{legend}</FieldLabel>
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const fieldId = `${idPrefix}-${option.value}`;
          return (
            <Field key={option.value} orientation="horizontal">
              <Checkbox
                id={fieldId}
                checked={selected.includes(option.value)}
                onCheckedChange={(checked) =>
                  onToggle(option.value, checked === true)
                }
              />
              <FieldLabel
                htmlFor={fieldId}
                className="cursor-pointer font-normal"
              >
                {option.label}
              </FieldLabel>
            </Field>
          );
        })}
      </div>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

export function WidgetConfigFields({
  kind,
  config,
  onChange,
  targets,
}: WidgetConfigFieldsProps) {
  const t = useTranslations("dashboards");
  const tAlerts = useTranslations("alerts");
  const tLogs = useTranslations("logs");
  const formatId = useId();
  const timeZoneId = useId();
  const locationId = useId();
  const latitudeId = useId();
  const longitudeId = useId();
  const unitId = useId();
  const noteId = useId();
  const showSecondsId = useId();
  const showDateId = useId();
  const unreadOnlyId = useId();
  const messagesUnreadOnlyId = useId();

  const title = (
    <TitleField
      value={config.title}
      onChange={(value) => onChange({ title: value })}
    />
  );

  switch (kind) {
    case "CLOCK":
      return (
        <FieldGroup>
          {title}
          <Field>
            <FieldLabel htmlFor={formatId}>{t("clock.formatLabel")}</FieldLabel>
            <NativeSelect
              id={formatId}
              value={str(config.format) || "24h"}
              onChange={(event) => onChange({ format: event.target.value })}
              className="w-full"
            >
              <NativeSelectOption value="24h">
                {t("clock.format24h")}
              </NativeSelectOption>
              <NativeSelectOption value="12h">
                {t("clock.format12h")}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={showSecondsId}
              checked={bool(config.showSeconds)}
              onCheckedChange={(checked) =>
                onChange({ showSeconds: checked === true })
              }
            />
            <FieldLabel
              htmlFor={showSecondsId}
              className="cursor-pointer font-normal"
            >
              {t("clock.showSecondsLabel")}
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={showDateId}
              checked={bool(config.showDate)}
              onCheckedChange={(checked) =>
                onChange({ showDate: checked === true })
              }
            />
            <FieldLabel
              htmlFor={showDateId}
              className="cursor-pointer font-normal"
            >
              {t("clock.showDateLabel")}
            </FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor={timeZoneId}>
              {t("clock.timeZoneLabel")}
            </FieldLabel>
            <Input
              id={timeZoneId}
              value={str(config.timeZone)}
              placeholder={t("clock.timeZonePlaceholder")}
              onChange={(event) =>
                onChange({ timeZone: event.target.value || undefined })
              }
            />
            <FieldDescription>{t("clock.timeZoneHint")}</FieldDescription>
          </Field>
        </FieldGroup>
      );

    case "WEATHER":
      return (
        <FieldGroup>
          {title}
          <Field>
            <FieldLabel htmlFor={locationId}>
              {t("weather.locationLabel")}
            </FieldLabel>
            <Input
              id={locationId}
              value={str(config.label)}
              placeholder={t("weather.locationPlaceholder")}
              onChange={(event) => onChange({ label: event.target.value })}
              aria-required="true"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={latitudeId}>
              {t("weather.latitudeLabel")}
            </FieldLabel>
            <Input
              id={latitudeId}
              type="number"
              step="0.0001"
              min={-90}
              max={90}
              value={numOrNull(config.latitude) ?? ""}
              onChange={(event) =>
                onChange({
                  latitude:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={longitudeId}>
              {t("weather.longitudeLabel")}
            </FieldLabel>
            <Input
              id={longitudeId}
              type="number"
              step="0.0001"
              min={-180}
              max={180}
              value={numOrNull(config.longitude) ?? ""}
              onChange={(event) =>
                onChange({
                  longitude:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={unitId}>{t("weather.unitLabel")}</FieldLabel>
            <NativeSelect
              id={unitId}
              value={str(config.unit) || "celsius"}
              onChange={(event) => onChange({ unit: event.target.value })}
              className="w-full"
            >
              <NativeSelectOption value="celsius">
                {t("weather.unitCelsius")}
              </NativeSelectOption>
              <NativeSelectOption value="fahrenheit">
                {t("weather.unitFahrenheit")}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
        </FieldGroup>
      );

    case "CALENDAR": {
      const sources = list(config.sources);
      return (
        <FieldGroup>
          {title}
          <CheckboxList
            legend={t("calendar.sourcesLabel")}
            options={CALENDAR_EVENT_SOURCES.map((source) => ({
              value: source,
              label: t(`calendar.sources.${source as CalendarEventSource}`),
            }))}
            selected={sources}
            onToggle={(value, on) =>
              onChange({ sources: toggle(sources, value, on) })
            }
          />
        </FieldGroup>
      );
    }

    case "NOTE":
      return (
        <FieldGroup>
          {title}
          <Field>
            <FieldLabel htmlFor={noteId}>{t("note.textLabel")}</FieldLabel>
            <Textarea
              id={noteId}
              rows={6}
              value={str(config.text)}
              placeholder={t("note.textPlaceholder")}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </Field>
        </FieldGroup>
      );

    case "BOOKMARKS":
      return (
        <FieldGroup>
          {title}
          <TargetSelect
            label={t("bookmarks.categoryLabel")}
            allOption={t("bookmarks.allCategoriesOption")}
            options={targets.bookmarkCategories}
            value={config.categoryId}
            onChange={(id) => onChange({ categoryId: id })}
          />
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );

    case "KANBAN": {
      // The column select only offers columns of the chosen board, and clearing
      // the board clears the column with it — otherwise the widget would point
      // at a column that is no longer reachable from its own configuration.
      const boardId = config.boardId;
      return (
        <FieldGroup>
          {title}
          <TargetSelect
            label={t("kanban.boardLabel")}
            allOption={t("kanban.noBoardOption")}
            options={targets.kanbanBoards}
            value={boardId}
            onChange={(id) => onChange({ boardId: id, columnId: null })}
          />
          <TargetSelect
            label={t("kanban.columnLabel")}
            allOption={t("kanban.allColumnsOption")}
            options={targets.kanbanColumns.filter(
              (column) => column.boardId === boardId,
            )}
            value={config.columnId}
            onChange={(id) => onChange({ columnId: id })}
          />
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );
    }

    case "SERVICE_STATUS": {
      const serviceIds = list(config.serviceIds);
      return (
        <FieldGroup>
          {title}
          <CheckboxList
            legend={t("serviceStatus.servicesLabel")}
            hint={t("serviceStatus.allServicesOption")}
            options={targets.services.map((service) => ({
              value: service.id,
              label: service.name,
            }))}
            selected={serviceIds}
            onToggle={(value, on) =>
              onChange({ serviceIds: toggle(serviceIds, value, on) })
            }
          />
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );
    }

    case "SERVER_METRICS": {
      // Read through the schema's helper, so a widget still holding the
      // pre-multi-select `localServerId` opens with that server ticked.
      const serverIds = readServerSelection(config);
      return (
        <FieldGroup>
          {title}
          <CheckboxList
            legend={t("serverMetrics.serversLabel")}
            hint={t("serverMetrics.allServersHint")}
            options={targets.servers.map((server) => ({
              value: server.id,
              label: server.name,
            }))}
            selected={serverIds}
            onToggle={(value, on) =>
              onChange({ localServerIds: toggle(serverIds, value, on) })
            }
          />
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );
    }

    case "MAIL":
      return (
        <FieldGroup>
          {title}
          <TargetSelect
            label={t("mail.accountLabel")}
            allOption={t("mail.allAccountsOption")}
            options={targets.mailAccounts}
            value={config.accountId}
            onChange={(id) => onChange({ accountId: id })}
          />
          <Field orientation="horizontal">
            <Checkbox
              id={unreadOnlyId}
              checked={bool(config.unreadOnly)}
              onCheckedChange={(checked) =>
                onChange({ unreadOnly: checked === true })
              }
            />
            <FieldLabel
              htmlFor={unreadOnlyId}
              className="cursor-pointer font-normal"
            >
              {t("mail.unreadOnlyLabel")}
            </FieldLabel>
          </Field>
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );

    case "MESSAGES": {
      const categoryId = str(config.categoryId) || null;
      const channelIds = list(config.channelIds);
      // Only the chosen category's channels are offered; picking a category
      // therefore also drops ticks that no longer belong to it, in the same
      // patch, so the form never shows a selection the list cannot display.
      const channels = categoryId
        ? targets.messageChannels.filter(
            (channel) => channel.categoryId === categoryId,
          )
        : targets.messageChannels;
      return (
        <FieldGroup>
          {title}
          <TargetSelect
            label={t("messages.categoryLabel")}
            allOption={t("messages.allCategoriesOption")}
            options={targets.messageCategories}
            value={config.categoryId}
            onChange={(id) =>
              onChange({
                categoryId: id,
                channelIds: channelIds.filter((channelId) =>
                  targets.messageChannels.some(
                    (channel) =>
                      channel.id === channelId &&
                      (!id || channel.categoryId === id),
                  ),
                ),
              })
            }
          />
          <CheckboxList
            legend={t("messages.channelsLabel")}
            hint={t("messages.allChannelsHint")}
            options={channels.map((channel) => ({
              value: channel.id,
              label: channel.name,
            }))}
            selected={channelIds}
            onToggle={(value, on) =>
              onChange({ channelIds: toggle(channelIds, value, on) })
            }
          />
          <Field orientation="horizontal">
            <Checkbox
              id={messagesUnreadOnlyId}
              checked={bool(config.unreadOnly)}
              onCheckedChange={(checked) =>
                onChange({ unreadOnly: checked === true })
              }
            />
            <FieldLabel
              htmlFor={messagesUnreadOnlyId}
              className="cursor-pointer font-normal"
            >
              {t("messages.unreadOnlyLabel")}
            </FieldLabel>
          </Field>
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );
    }

    case "ALERTS": {
      const severities = list(config.severities);
      // Severity wording comes from the Alerts section's own catalogue, so a
      // widget filter and the section filter can never spell a level two ways.
      const severityLabels: Record<string, string> = {
        info: tAlerts("severityInfoOption"),
        warning: tAlerts("severityWarningOption"),
        error: tAlerts("severityErrorOption"),
        critical: tAlerts("severityCriticalOption"),
      };
      return (
        <FieldGroup>
          {title}
          <CheckboxList
            legend={t("alerts.severitiesLabel")}
            hint={t("alerts.allSeveritiesHint")}
            options={ALERT_SEVERITIES.map((severity) => ({
              value: severity,
              label: severityLabels[severity],
            }))}
            selected={severities}
            onToggle={(value, on) =>
              onChange({ severities: toggle(severities, value, on) })
            }
          />
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );
    }

    case "LOGS": {
      const levels = list(config.levels);
      const levelLabels: Record<string, string> = {
        info: tLogs("levelInfo"),
        warning: tLogs("levelWarning"),
        error: tLogs("levelError"),
        critical: tLogs("levelCritical"),
      };
      return (
        <FieldGroup>
          {title}
          <CheckboxList
            legend={t("logs.levelsLabel")}
            hint={t("logs.allLevelsHint")}
            options={LOG_LEVELS.map((level) => ({
              value: level,
              label: levelLabels[level],
            }))}
            selected={levels}
            onToggle={(value, on) =>
              onChange({ levels: toggle(levels, value, on) })
            }
          />
          <LimitField
            value={config.limit}
            onChange={(limit) => onChange({ limit })}
          />
        </FieldGroup>
      );
    }
  }
}
