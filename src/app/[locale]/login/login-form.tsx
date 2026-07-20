"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { login } from "./actions";

// Maps the Server Action's stable, intentionally-English error codes
// (src/app/[locale]/login/actions.ts) to auth.json translation keys.
// Unrecognized codes fall back to a generic, translated message.
const LOGIN_ERROR_KEYS: Record<string, string> = {
  "Username and password are required.": "errorUsernamePasswordRequired",
  "Invalid username or password.": "errorInvalidCredentials",
};

const AUTHENTIK_ERROR_KEYS: Record<string, string> = {
  authentik_state: "errorAuthentikState",
};

// AC-AUTH-002/003 UI (design.md §3.1). Client Component: owns form state,
// the empty-field submit-disable (design's narrow, documented exception to
// "submit is never silently disabled" — see §3.1 rationale), and the generic
// error banner. Calls the `login` Server Action (src/app/login/actions.ts,
// backend-dev-owned) directly rather than via `useActionState`, since the
// frozen contract's signature is `login(formData)` (single arg, no prevState).
export function LoginForm({
  next,
  authentikEnabled = false,
  authentikError,
}: {
  next?: string;
  authentikEnabled?: boolean;
  authentikError?: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();

  function localizeLoginError(error: string) {
    return t(LOGIN_ERROR_KEYS[error] ?? "errorLoginGeneric");
  }

  function localizeAuthentikError(error: string) {
    return t(AUTHENTIK_ERROR_KEYS[error] ?? "errorAuthentikGeneric");
  }

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    authentikError ? localizeAuthentikError(authentikError) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const authentikHref = `/api/auth/authentik/login${
    next ? `?next=${encodeURIComponent(next)}` : ""
  }`;

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("username", username);
      formData.set("password", password);
      const result = await login(formData);
      if (result.ok) {
        router.push(sanitizeNextPath(next));
        router.refresh();
      } else {
        setError(localizeLoginError(result.error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-95">
      <CardHeader>
        <h1 className="font-heading text-base leading-none font-medium text-foreground">
          {t("loginHeading")}
        </h1>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <Field data-disabled={submitting || undefined}>
              <FieldLabel htmlFor="login-username">
                {t("usernameLabel")}
              </FieldLabel>
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={submitting}
                aria-required="true"
                autoFocus
              />
            </Field>

            <Field data-disabled={submitting || undefined}>
              <FieldLabel htmlFor="login-password">
                {t("passwordLabel")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="········"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                  aria-required="true"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={submitting}
                    aria-label={
                      showPassword
                        ? t("hidePasswordLabel")
                        : t("showPasswordLabel")
                    }
                  >
                    {showPassword ? (
                      <Icon name="ri-eye-off-line" aria-hidden />
                    ) : (
                      <Icon name="ri-eye-line" aria-hidden />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>

          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Spinner aria-hidden data-icon="inline-start" />
                {t("signingIn")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </form>

        {authentikEnabled && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                {t("orDivider")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              render={<Link href={authentikHref} />}
              nativeButton={false}
              variant="outline"
              className="w-full"
            >
              {t("loginWithAuthentik")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
