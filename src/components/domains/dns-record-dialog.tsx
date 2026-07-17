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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { DnsRecord } from "@/lib/providers/dns/types";
import { ApiError, createRecord, updateRecord } from "./api";
import {
  DNS_RECORD_TYPES,
  type DnsRecordType,
  validatePriority,
  validateRecordValue,
  validateTtl,
} from "./validation";

export type DnsRecordDialogState =
  | { mode: "create"; providerId: string; domainId: string }
  | {
      mode: "edit";
      providerId: string;
      domainId: string;
      record: DnsRecord;
    };

interface DnsRecordDialogProps {
  state: DnsRecordDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  value?: string;
  ttl?: string;
  priority?: string;
}

const TYPE_ITEMS = Object.fromEntries(
  DNS_RECORD_TYPES.map((type) => [type, type]),
);

// AC-DOM-005/006/007/008/009 (design.md §6.1). Create and edit share one
// dialog. `type` and `name` are immutable once a record exists — the PATCH
// contract (dnsRecordPatchSchema) only accepts value/ttl/priority — so both
// fields are disabled (not hidden, for context) in edit mode.
export function DnsRecordDialog({
  state,
  onOpenChange,
  onSaved,
}: DnsRecordDialogProps) {
  const typeFieldId = useId();
  const nameId = useId();
  const valueId = useId();
  const ttlId = useId();
  const priorityId = useId();
  const nameErrorId = useId();
  const valueErrorId = useId();
  const ttlErrorId = useId();
  const priorityErrorId = useId();

  const [type, setType] = useState<DnsRecordType>("A");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [ttl, setTtl] = useState("3600");
  const [priority, setPriority] = useState("10");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = state?.mode === "edit";

  // Reset the form when the dialog target changes, using React's "adjust
  // state while rendering on prop change" pattern instead of an effect
  // (react.dev/reference/react/useState) — same pattern as
  // bookmarks/bookmark-dialog.tsx.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      const record = state.record;
      setType(record.type as DnsRecordType);
      setName(record.name);
      setValue(record.value);
      setTtl(String(record.ttl));
      setPriority("10");
    } else if (state?.mode === "create") {
      setType("A");
      setName("");
      setValue("");
      setTtl("3600");
      setPriority("10");
    }
    setErrors({});
  }

  const isMx = type === "MX";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;

    const trimmedName = name.trim();
    const trimmedValue = value.trim();
    const nextErrors: FieldErrors = {};

    if (state.mode === "create" && !trimmedName) {
      nextErrors.name = "Название обязательно";
    }
    const valueError = validateRecordValue(type, trimmedValue);
    if (valueError) nextErrors.value = valueError;
    const ttlError = validateTtl(ttl);
    if (ttlError) nextErrors.ttl = ttlError;
    if (isMx) {
      const priorityError = validatePriority(priority);
      if (priorityError) nextErrors.priority = priorityError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (state.mode === "edit") {
        await updateRecord(state.providerId, state.domainId, state.record.id, {
          value: trimmedValue,
          ttl: Number(ttl),
          ...(isMx ? { priority: Number(priority) } : {}),
        });
        toast.success("DNS-запись обновлена.");
      } else {
        await createRecord(state.providerId, state.domainId, {
          type,
          name: trimmedName,
          value: trimmedValue,
          ttl: Number(ttl),
          ...(isMx ? { priority: Number(priority) } : {}),
        });
        toast.success("DNS-запись создана.");
      }
      onSaved();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({
          name: err.fieldErrors.name,
          value: err.fieldErrors.value,
          ttl: err.fieldErrors.ttl,
          priority: err.fieldErrors.priority,
        });
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось сохранить DNS-запись. Попробуйте снова.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Изменить DNS-запись" : "Добавить DNS-запись"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-disabled={isEdit || undefined}>
              <FieldLabel htmlFor={typeFieldId}>Тип</FieldLabel>
              <Select
                value={type}
                onValueChange={(next) => setType(next as DnsRecordType)}
                items={TYPE_ITEMS}
                disabled={isEdit}
              >
                <SelectTrigger id={typeFieldId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DNS_RECORD_TYPES.map((recordType) => (
                      <SelectItem key={recordType} value={recordType}>
                        {recordType}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field
              data-disabled={isEdit || undefined}
              data-invalid={!!errors.name || undefined}
            >
              <FieldLabel htmlFor={nameId}>Название</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isEdit}
                aria-required="true"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? nameErrorId : undefined}
                placeholder="@ или поддомен"
                autoFocus={!isEdit}
                className="font-mono"
              />
              <FieldError id={nameErrorId}>{errors.name}</FieldError>
            </Field>

            <Field data-invalid={!!errors.value || undefined}>
              <FieldLabel htmlFor={valueId}>Значение</FieldLabel>
              <Input
                id={valueId}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.value || undefined}
                aria-describedby={errors.value ? valueErrorId : undefined}
                autoFocus={isEdit}
                className="font-mono"
              />
              <FieldError id={valueErrorId}>{errors.value}</FieldError>
            </Field>

            <Field data-invalid={!!errors.ttl || undefined}>
              <FieldLabel htmlFor={ttlId}>TTL (секунды)</FieldLabel>
              <Input
                id={ttlId}
                type="number"
                min={1}
                value={ttl}
                onChange={(event) => setTtl(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.ttl || undefined}
                aria-describedby={errors.ttl ? ttlErrorId : undefined}
                className="font-mono"
              />
              <FieldError id={ttlErrorId}>{errors.ttl}</FieldError>
            </Field>

            {isMx && (
              <Field data-invalid={!!errors.priority || undefined}>
                <FieldLabel htmlFor={priorityId}>Приоритет</FieldLabel>
                <Input
                  id={priorityId}
                  type="number"
                  min={0}
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.priority || undefined}
                  aria-describedby={
                    errors.priority ? priorityErrorId : undefined
                  }
                  className="font-mono"
                />
                <FieldError id={priorityErrorId}>{errors.priority}</FieldError>
              </Field>
            )}
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit ? (
                submitting ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  "Сохранить изменения"
                )
              ) : submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  Создание…
                </>
              ) : (
                "Создать"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
