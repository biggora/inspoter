"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Service } from "@/generated/prisma/client";
import { ApiError, servicesApi, type MonitorTypeValue } from "./api";
import { MONITOR_TYPE_LABELS } from "./format";

export type ServiceFormDialogState =
  { mode: "create" } | { mode: "edit"; service: Service };

interface ServiceFormDialogProps {
  state: ServiceFormDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  url?: string;
  host?: string;
  port?: string;
  expectedStatusCodes?: string;
  intervalSeconds?: string;
  timeoutMs?: string;
  retries?: string;
}

const DEFAULT_INTERVAL_SECONDS = "60";
const DEFAULT_TIMEOUT_MS = "5000";
const DEFAULT_RETRIES = "1";

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Create/edit dialog for a Service (plan.md "Frontend"). One component
// handles both modes via a discriminated `state` prop, same pattern as
// CategoryFormDialog/BookmarkDialog. The monitorType Select conditionally
// swaps the target fields (url / host+port / host) rather than rendering
// three separate forms.
export function ServiceFormDialog({
  state,
  onOpenChange,
  onSaved,
}: ServiceFormDialogProps) {
  const nameId = useId();
  const descriptionId = useId();
  const monitorTypeId = useId();
  const urlId = useId();
  const hostId = useId();
  const portId = useId();
  const expectedStatusCodesId = useId();
  const intervalSecondsId = useId();
  const timeoutMsId = useId();
  const retriesId = useId();
  const isActiveId = useId();

  const isEdit = state?.mode === "edit";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monitorType, setMonitorType] = useState<MonitorTypeValue>("HTTP");
  const [url, setUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [expectedStatusCodes, setExpectedStatusCodes] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(
    DEFAULT_INTERVAL_SECONDS,
  );
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS);
  const [retries, setRetries] = useState(DEFAULT_RETRIES);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset the form when the dialog target changes, using React's "adjust
  // state while rendering on prop change" pattern (see bookmark-dialog.tsx)
  // instead of an effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      const service = state.service;
      setName(service.name);
      setDescription(service.description ?? "");
      setMonitorType(service.monitorType);
      setUrl(service.url ?? "");
      setHost(service.host ?? "");
      setPort(service.port !== null ? String(service.port) : "");
      setExpectedStatusCodes(service.expectedStatusCodes ?? "");
      setIntervalSeconds(String(service.intervalSeconds));
      setTimeoutMs(String(service.timeoutMs));
      setRetries(String(service.retries));
      setIsActive(service.isActive);
    } else if (state?.mode === "create") {
      setName("");
      setDescription("");
      setMonitorType("HTTP");
      setUrl("");
      setHost("");
      setPort("");
      setExpectedStatusCodes("");
      setIntervalSeconds(DEFAULT_INTERVAL_SECONDS);
      setTimeoutMs(DEFAULT_TIMEOUT_MS);
      setRetries(DEFAULT_RETRIES);
      setIsActive(true);
    }
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const trimmedHost = host.trim();
    const trimmedPort = port.trim();

    const nextErrors: FieldErrors = {};
    if (!trimmedName) nextErrors.name = "Название обязательно.";
    if (monitorType === "HTTP") {
      if (!trimmedUrl) nextErrors.url = "URL обязателен.";
      else if (!isValidHttpUrl(trimmedUrl)) {
        nextErrors.url =
          "Введите корректный URL, начинающийся с http:// или https://.";
      }
    } else if (monitorType === "TCP") {
      if (!trimmedHost) nextErrors.host = "Хост обязателен.";
      if (!trimmedPort) nextErrors.port = "Порт обязателен.";
    } else {
      if (!trimmedHost) nextErrors.host = "Хост обязателен.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {
      name: trimmedName,
      description: description.trim() ? description.trim() : null,
      monitorType,
      ...(monitorType === "HTTP"
        ? {
            url: trimmedUrl,
            expectedStatusCodes: expectedStatusCodes.trim() || undefined,
          }
        : {
            host: trimmedHost,
            ...(trimmedPort ? { port: Number(trimmedPort) } : {}),
          }),
      intervalSeconds: intervalSeconds.trim()
        ? Number(intervalSeconds)
        : undefined,
      timeoutMs: timeoutMs.trim() ? Number(timeoutMs) : undefined,
      retries: retries.trim() ? Number(retries) : undefined,
      isActive,
    };

    setSubmitting(true);
    try {
      if (state?.mode === "edit") {
        await servicesApi.update(state.service.id, payload);
        toast.success("Сервис обновлён.");
      } else {
        await servicesApi.create(payload);
        toast.success("Сервис создан.");
      }
      onSaved();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors(err.fieldErrors);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось сохранить сервис. Попробуйте снова.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const monitorTypeItems: Record<MonitorTypeValue, string> =
    MONITOR_TYPE_LABELS;

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Редактировать сервис" : "Новый сервис"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Название</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={errors.name ? true : undefined}
              autoFocus
            />
            {errors.name && (
              <p className="text-sm text-(--error-text)">{errors.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={descriptionId}>Описание (необязательно)</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={monitorTypeId}>Тип монитора</Label>
            <Select
              value={monitorType}
              onValueChange={(value) =>
                setMonitorType(value as MonitorTypeValue)
              }
              items={monitorTypeItems}
            >
              <SelectTrigger id={monitorTypeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(monitorTypeItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {monitorType === "HTTP" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={urlId}>URL</Label>
                <Input
                  id={urlId}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  aria-required="true"
                  aria-invalid={errors.url ? true : undefined}
                  placeholder="https://example.com/health"
                />
                {errors.url && (
                  <p className="text-sm text-(--error-text)">{errors.url}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={expectedStatusCodesId}>
                  Ожидаемые коды ответа (необязательно)
                </Label>
                <Input
                  id={expectedStatusCodesId}
                  value={expectedStatusCodes}
                  onChange={(event) =>
                    setExpectedStatusCodes(event.target.value)
                  }
                  placeholder="200-299"
                  aria-invalid={errors.expectedStatusCodes ? true : undefined}
                />
                {errors.expectedStatusCodes && (
                  <p className="text-sm text-(--error-text)">
                    {errors.expectedStatusCodes}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={hostId}>Хост</Label>
                <Input
                  id={hostId}
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  aria-required="true"
                  aria-invalid={errors.host ? true : undefined}
                  placeholder="example.com"
                />
                {errors.host && (
                  <p className="text-sm text-(--error-text)">{errors.host}</p>
                )}
              </div>
              <div className="flex w-28 flex-col gap-1.5">
                <Label htmlFor={portId}>
                  Порт{monitorType === "PING" ? " (необязательно)" : ""}
                </Label>
                <Input
                  id={portId}
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                  aria-required={monitorType === "TCP" ? "true" : undefined}
                  aria-invalid={errors.port ? true : undefined}
                  placeholder={monitorType === "PING" ? "80" : undefined}
                />
                {errors.port && (
                  <p className="text-sm text-(--error-text)">{errors.port}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={intervalSecondsId}>Интервал (сек)</Label>
              <Input
                id={intervalSecondsId}
                type="number"
                min={10}
                max={86400}
                value={intervalSeconds}
                onChange={(event) => setIntervalSeconds(event.target.value)}
                aria-invalid={errors.intervalSeconds ? true : undefined}
              />
              {errors.intervalSeconds && (
                <p className="text-sm text-(--error-text)">
                  {errors.intervalSeconds}
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={timeoutMsId}>Таймаут (мс)</Label>
              <Input
                id={timeoutMsId}
                type="number"
                min={1000}
                max={30000}
                value={timeoutMs}
                onChange={(event) => setTimeoutMs(event.target.value)}
                aria-invalid={errors.timeoutMs ? true : undefined}
              />
              {errors.timeoutMs && (
                <p className="text-sm text-(--error-text)">
                  {errors.timeoutMs}
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={retriesId}>Попыток до сбоя</Label>
              <Input
                id={retriesId}
                type="number"
                min={1}
                max={10}
                value={retries}
                onChange={(event) => setRetries(event.target.value)}
                aria-invalid={errors.retries ? true : undefined}
              />
              {errors.retries && (
                <p className="text-sm text-(--error-text)">{errors.retries}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={isActiveId}
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="size-4 rounded border border-input accent-[var(--action-primary)]"
            />
            <Label htmlFor={isActiveId} className="cursor-pointer font-normal">
              Активен (проверять по расписанию)
            </Label>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit
                ? submitting
                  ? "Сохранение…"
                  : "Сохранить изменения"
                : submitting
                  ? "Создание…"
                  : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
