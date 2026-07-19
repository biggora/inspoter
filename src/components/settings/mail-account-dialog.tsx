"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("settings");
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
    if (!name.trim()) nextErrors.name = t("nameRequiredError");
    if (!email.trim()) nextErrors.email = t("emailRequiredError");
    if (!imapHost.trim()) nextErrors.imapHost = t("imapHostRequiredError");
    if (!smtpHost.trim()) nextErrors.smtpHost = t("smtpHostRequiredError");
    if (!username.trim()) nextErrors.username = t("usernameRequiredError");
    if (opts.requirePassword && !password) {
      nextErrors.password = t("passwordRequiredError");
    }

    const imapPortNumber = Number(imapPort);
    if (!Number.isInteger(imapPortNumber) || imapPortNumber < 1 || imapPortNumber > 65535) {
      nextErrors.imapPort = t("portRangeError");
    }
    const smtpPortNumber = Number(smtpPort);
    if (!Number.isInteger(smtpPortNumber) || smtpPortNumber < 1 || smtpPortNumber > 65535) {
      nextErrors.smtpPort = t("portRangeError");
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
        validationErrors.password = t("enterPasswordToTestError");
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
          err instanceof ApiError ? err.message : t("testConnectionError"),
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
        setErrors({ name: t("nameRequiredError") });
        return;
      }
      setSubmitting(true);
      setErrors({});
      try {
        await mailAccountsApi.update(existing!.id, { name: trimmedName });
        toast.success(t("accountSavedToast"));
        onOpenChange(false);
        onSaved();
      } catch (err) {
        setErrors({
          global:
            err instanceof ApiError ? err.message : t("saveAccountError"),
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
      toast.success(t("accountSavedToast"));
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
                err instanceof ApiError ? err.message : t("saveAccountError"),
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
        <FieldLabel htmlFor={id}>{t("securityLabel")}</FieldLabel>
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
              ? t("addAccountTitle")
              : t("editAccountTitle", { name: existing?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            {renderTextField("name", t("nameLabel"), name, setName, {
              placeholder: t("accountNamePlaceholder"),
              autoFocus: true,
            })}

            {!isWebhook && (
              <>
                {renderTextField("email", t("emailLabel"), email, setEmail, {
                  type: "email",
                  placeholder: t("emailPlaceholder"),
                  autoComplete: "off",
                })}

                <div className="grid grid-cols-[1fr_6rem_8rem] gap-2">
                  {renderTextField(
                    "imapHost",
                    t("imapHostLabel"),
                    imapHost,
                    setImapHost,
                    { placeholder: t("imapHostPlaceholder") },
                  )}
                  {renderTextField(
                    "imapPort",
                    t("portLabel"),
                    imapPort,
                    setImapPort,
                    { inputMode: "numeric" },
                  )}
                  {renderSecurityField(
                    "imapSecurity",
                    imapSecurity,
                    setImapSecurity,
                  )}
                </div>

                <div className="grid grid-cols-[1fr_6rem_8rem] gap-2">
                  {renderTextField(
                    "smtpHost",
                    t("smtpHostLabel"),
                    smtpHost,
                    setSmtpHost,
                    { placeholder: t("smtpHostPlaceholder") },
                  )}
                  {renderTextField(
                    "smtpPort",
                    t("portLabel"),
                    smtpPort,
                    setSmtpPort,
                    { inputMode: "numeric" },
                  )}
                  {renderSecurityField(
                    "smtpSecurity",
                    smtpSecurity,
                    setSmtpSecurity,
                  )}
                </div>

                {renderTextField(
                  "username",
                  t("usernameLabel"),
                  username,
                  setUsername,
                  { autoComplete: "off" },
                )}

                <Field data-invalid={!!errors.password || undefined}>
                  <FieldLabel htmlFor={fieldId("password")}>
                    {t("passwordLabel")}
                  </FieldLabel>
                  <Input
                    id={fieldId("password")}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      mode === "edit"
                        ? t("passwordEditPlaceholder")
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
                    {t("passwordDescription")}
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
                  {t("connectionSuccess")}
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
                      ? t("smtpConnectionError")
                      : t("imapConnectionError"))}
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
                    {t("testingLabel")}
                  </>
                ) : (
                  t("testConnectionButton")
                )}
              </Button>
            )}
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting || testing}>
              {submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("savingLabel")}
                </>
              ) : (
                t("saveButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
