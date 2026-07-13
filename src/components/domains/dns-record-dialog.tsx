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
      nextErrors.name = "Name is required";
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
        toast.success("DNS record updated.");
      } else {
        await createRecord(state.providerId, state.domainId, {
          type,
          name: trimmedName,
          value: trimmedValue,
          ttl: Number(ttl),
          ...(isMx ? { priority: Number(priority) } : {}),
        });
        toast.success("DNS record created.");
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
            : "Couldn't save DNS record. Try again.",
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
            {isEdit ? "Edit DNS record" : "Add DNS record"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={typeFieldId}>Type</Label>
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
                {DNS_RECORD_TYPES.map((recordType) => (
                  <SelectItem key={recordType} value={recordType}>
                    {recordType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isEdit}
              aria-required="true"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? nameErrorId : undefined}
              placeholder="@ or subdomain"
              autoFocus={!isEdit}
              className="font-mono"
            />
            {errors.name && (
              <p id={nameErrorId} className="text-sm text-(--error-text)">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={valueId}>Value</Label>
            <Input
              id={valueId}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-required="true"
              aria-invalid={errors.value ? true : undefined}
              aria-describedby={errors.value ? valueErrorId : undefined}
              autoFocus={isEdit}
              className="font-mono"
            />
            {errors.value && (
              <p id={valueErrorId} className="text-sm text-(--error-text)">
                {errors.value}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ttlId}>TTL (seconds)</Label>
            <Input
              id={ttlId}
              type="number"
              min={1}
              value={ttl}
              onChange={(event) => setTtl(event.target.value)}
              aria-required="true"
              aria-invalid={errors.ttl ? true : undefined}
              aria-describedby={errors.ttl ? ttlErrorId : undefined}
              className="font-mono"
            />
            {errors.ttl && (
              <p id={ttlErrorId} className="text-sm text-(--error-text)">
                {errors.ttl}
              </p>
            )}
          </div>

          {isMx && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={priorityId}>Priority</Label>
              <Input
                id={priorityId}
                type="number"
                min={0}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                aria-required="true"
                aria-invalid={errors.priority ? true : undefined}
                aria-describedby={errors.priority ? priorityErrorId : undefined}
                className="font-mono"
              />
              {errors.priority && (
                <p id={priorityErrorId} className="text-sm text-(--error-text)">
                  {errors.priority}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit
                ? submitting
                  ? "Saving…"
                  : "Save changes"
                : submitting
                  ? "Creating…"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
