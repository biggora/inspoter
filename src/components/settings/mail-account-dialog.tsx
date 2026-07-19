"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
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
import {
  ApiError,
  mailAccountsApi,
  type CreateMailAccountInput,
  type MailAccountDto,
  type MailSecurity,
  type TestConnectionResult,
} from "./mail-accounts-api";

const SECURITY_ITEMS = [
  { label: "SSL", value: "SSL" },
  { label: "STARTTLS", value: "STARTTLS" },
];

interface MailAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  existing: MailAccountDto | null;
  onSaved: () => void;
}

// Settings > Mail accounts — create/edit dialog (patterned after
// provider-credential-dialog.tsx). The password field always starts empty:
// secrets never round-trip from the server, an empty password on edit means
// "keep the stored one". The system WEBHOOK account only exposes the name.
export function MailAccountDialog({
  open,
  onOpenChange,
  mode,
  existing,
  onSaved,
}: MailAccountDialogProps) {
  const isWebhook = existing?.kind === "WEBHOOK";

  // Rendered only while a dialog is open (see mail-accounts-view.tsx's
  // guard), so it fully remounts on each open — these initial values don't
  // need to be re-synced via an effect.
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [imapHost, setImapHost] = useState(existing?.imapHost ?? "");
  const [imapPort, setImapPort] = useState(
    String(existing?.imapPort ?? 993),
  );
  const [imapSecurity, setImapSecurity] = useState<MailSecurity>(
    existing?.imapSecurity ?? "SSL",
  );
  const [smtpHost, setSmtpHost] = useState(existing?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(
    String(existing?.smtpPort ?? 465),
  );
  const [smtpSecurity, setSmtpSecurity] = useState<MailSecurity>(
    existing?.smtpSecurity ?? "SSL",
  );
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const baseId = useId();
  const fieldId = (field: string) => `${baseId}-${field}`;

  function validate(opts: { requirePassword: boolean }): {
    payload: CreateMailAccountInput;
    errors: Record<string, string>;
  } {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Название обязательно.";
    if (!email.trim()) nextErrors.email = "Укажите e-mail.";
    if (!imapHost.trim()) nextErrors.imapHost = "Укажите IMAP-сервер.";
    if (!smtpHost.trim()) nextErrors.smtpHost = "Укажите SMTP-сервер.";
    if (!username.trim()) nextErrors.username = "Логин обязателен.";
    if (opts.requirePassword && !password) {
      nextErrors.password = "Пароль обязателен.";
    }

    const imapPortNumber = Number(imapPort);
    if (!Number.isInteger(imapPortNumber) || imapPortNumber < 1 || imapPortNumber > 65535) {
      nextErrors.imapPort = "Порт должен быть в диапазоне 1–65535.";
    }
    const smtpPortNumber = Number(smtpPort);
    if (!Number.isInteger(smtpPortNumber) || smtpPortNumber < 1 || smtpPortNumber > 65535) {
      nextErrors.smtpPort = "Порт должен быть в диапазоне 1–65535.";
    }

    return {
      payload: {
        name: name.trim(),
        email: email.trim(),
        imapHost: imapHost.trim(),
        imapPort: imapPortNumber,
        imapSecurity,
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPortNumber,
        smtpSecurity,
        username: username.trim(),
        password,
      },
      errors: nextErrors,
    };
  }

  async function handleTest() {
    setTestResult(null);
    const { payload, errors: validationErrors } = validate({
      requirePassword: true,
    });
    if (Object.keys(validationErrors).length > 0) {
      if (mode === "edit" && validationErrors.password) {
        validationErrors.password =
          "Введите пароль, чтобы проверить подключение.";
      }
      setErrors(validationErrors);
      return;
    }

    setTesting(true);
    setErrors({});
    try {
      setTestResult(await mailAccountsApi.test(payload));
    } catch (err) {
      setErrors({
        global:
          err instanceof ApiError
            ? err.message
            : "Не удалось проверить подключение. Попробуйте снова.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isWebhook) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setErrors({ name: "Название обязательно." });
        return;
      }
      setSubmitting(true);
      setErrors({});
      try {
        await mailAccountsApi.update(existing!.id, { name: trimmedName });
        toast.success("Аккаунт сохранён.");
        onOpenChange(false);
        onSaved();
      } catch (err) {
        setErrors({
          global:
            err instanceof ApiError
              ? err.message
              : "Не удалось сохранить аккаунт. Попробуйте снова.",
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const { payload, errors: validationErrors } = validate({
      requirePassword: mode === "create",
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      if (mode === "create") {
        await mailAccountsApi.create(payload);
      } else {
        await mailAccountsApi.update(existing!.id, {
          ...payload,
          ...(password ? {} : { password: undefined }),
        });
      }
      toast.success("Аккаунт сохранён.");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setErrors(
        err instanceof ApiError &&
          err.fieldErrors &&
          Object.keys(err.fieldErrors).length > 0
          ? err.fieldErrors
          : {
              global:
                err instanceof ApiError
                  ? err.message
                  : "Не удалось сохранить аккаунт. Попробуйте снова.",
            },
      );
    } finally {
      setSubmitting(false);
    }
  }

  function renderTextField(
    field: string,
    label: string,
    value: string,
    setValue: (value: string) => void,
    inputProps?: React.ComponentProps<typeof Input>,
  ) {
    const message = errors[field];
    const id = fieldId(field);
    return (
      <Field data-invalid={!!message || undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={!!message || undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          {...inputProps}
        />
        <FieldError id={`${id}-error`}>{message}</FieldError>
      </Field>
    );
  }

  function renderSecurityField(
    field: string,
    value: MailSecurity,
    setValue: (value: MailSecurity) => void,
  ) {
    const id = fieldId(field);
    return (
      <Field>
        <FieldLabel htmlFor={id}>Защита</FieldLabel>
        <Select
          value={value}
          onValueChange={(next) => setValue((next ?? "SSL") as MailSecurity)}
          items={SECURITY_ITEMS}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SECURITY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  const testOk = testResult !== null && testResult.imapOk && testResult.smtpOk;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? "Добавить аккаунт"
              : `Изменить «${existing?.name}»`}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            {renderTextField("name", "Название", name, setName, {
              placeholder: 'например, "Рабочая почта"',
              autoFocus: true,
            })}

            {!isWebhook && (
              <>
                {renderTextField("email", "E-mail", email, setEmail, {
                  type: "email",
                  placeholder: "user@example.ru",
                  autoComplete: "off",
                })}

                <div className="grid grid-cols-[1fr_6rem_8rem] gap-2">
                  {renderTextField(
                    "imapHost",
                    "IMAP-сервер",
                    imapHost,
                    setImapHost,
                    { placeholder: "imap.example.ru" },
                  )}
                  {renderTextField("imapPort", "Порт", imapPort, setImapPort, {
                    inputMode: "numeric",
                  })}
                  {renderSecurityField(
                    "imapSecurity",
                    imapSecurity,
                    setImapSecurity,
                  )}
                </div>

                <div className="grid grid-cols-[1fr_6rem_8rem] gap-2">
                  {renderTextField(
                    "smtpHost",
                    "SMTP-сервер",
                    smtpHost,
                    setSmtpHost,
                    { placeholder: "smtp.example.ru" },
                  )}
                  {renderTextField("smtpPort", "Порт", smtpPort, setSmtpPort, {
                    inputMode: "numeric",
                  })}
                  {renderSecurityField(
                    "smtpSecurity",
                    smtpSecurity,
                    setSmtpSecurity,
                  )}
                </div>

                {renderTextField("username", "Логин", username, setUsername, {
                  autoComplete: "off",
                })}

                <Field data-invalid={!!errors.password || undefined}>
                  <FieldLabel htmlFor={fieldId("password")}>Пароль</FieldLabel>
                  <Input
                    id={fieldId("password")}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      mode === "edit"
                        ? "Оставьте пустым, чтобы не менять"
                        : undefined
                    }
                    autoComplete="off"
                    aria-invalid={!!errors.password || undefined}
                    aria-describedby={
                      errors.password
                        ? `${fieldId("password")}-error`
                        : undefined
                    }
                  />
                  <FieldDescription>
                    Используйте пароль приложения, а не основной пароль почты.
                  </FieldDescription>
                  <FieldError id={`${fieldId("password")}-error`}>
                    {errors.password}
                  </FieldError>
                </Field>
              </>
            )}
          </FieldGroup>

          {testResult && (
            <p
              className={
                testOk
                  ? "flex items-center gap-1.5 text-sm text-[var(--success-text)]"
                  : "flex items-center gap-1.5 text-sm text-[var(--error-text)]"
              }
              role="status"
            >
              {testOk ? (
                <>
                  <Icon
                    name="ri-checkbox-circle-line"
                    aria-hidden
                    className="text-base shrink-0"
                  />
                  Подключение успешно.
                </>
              ) : (
                <>
                  <Icon
                    name="ri-close-circle-line"
                    aria-hidden
                    className="text-base shrink-0"
                  />
                  {testResult.error ??
                    (testResult.imapOk
                      ? "Не удалось подключиться к SMTP-серверу."
                      : "Не удалось подключиться к IMAP-серверу.")}
                </>
              )}
            </p>
          )}

          {errors.global && (
            <Alert variant="error">
              <AlertDescription>{errors.global}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            {!isWebhook && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || submitting}
              >
                {testing ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    Проверка…
                  </>
                ) : (
                  "Проверить подключение"
                )}
              </Button>
            )}
            <DialogClose render={<Button variant="outline" type="button" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={submitting || testing}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  Сохранение…
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
