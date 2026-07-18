"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface MessageComposerProps {
  channelName: string;
  onSend: (content: string) => Promise<void>;
}

export function MessageComposer({ channelName, onSend }: MessageComposerProps) {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  async function send() {
    const content = draft.trim();
    if (!content || pending) return;

    setPending(true);
    setError(null);
    setAnnouncement("");
    try {
      await onSend(content);
      setDraft("");
      setAnnouncement("Сообщение отправлено.");
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Не удалось отправить сообщение. Попробуйте снова.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form
      className="shrink-0 border-t border-background-100 px-3 py-3 sm:px-5"
      onSubmit={handleSubmit}
      noValidate
    >
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor={inputId} className="sr-only">
          Сообщение в канале #{channelName}
        </FieldLabel>
        <div className="flex min-w-0 items-end gap-2">
          <Textarea
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Написать в #${channelName}...`}
            rows={2}
            maxLength={4000}
            disabled={pending}
            aria-invalid={!!error || undefined}
            aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
            className="max-h-40 min-h-16 resize-y"
          />
          <Button
            type="submit"
            size="icon"
            className="mb-0.5 shrink-0"
            disabled={pending || !draft.trim()}
            aria-label="Отправить сообщение"
          >
            {pending ? (
              <Spinner aria-hidden />
            ) : (
              <Send aria-hidden data-icon="inline-start" />
            )}
          </Button>
        </div>
        <p id={helpId} className="text-xs text-muted-foreground">
          Enter — новая строка, Ctrl+Enter — отправить
        </p>
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </form>
  );
}
