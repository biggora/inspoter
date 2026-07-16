"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { login } from "./actions";

function localizeLoginError(error: string) {
  if (error === "Username and password are required.") {
    return "Укажите имя пользователя и пароль.";
  }

  if (error === "Invalid username or password.") {
    return "Неверное имя пользователя или пароль.";
  }

  return "Не удалось выполнить вход. Проверьте данные и повторите попытку.";
}

function localizeAuthentikError(error: string) {
  if (error === "authentik_state") {
    return "Истекло время ожидания входа через Authentik. Попробуйте снова.";
  }

  return "Не удалось выполнить вход через Authentik. Попробуйте снова.";
}

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
  const router = useRouter();
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
    <Card className="w-full max-w-[380px]">
      <CardHeader>
        <h1 className="font-heading text-base leading-none font-medium text-foreground">
          Войти
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-username">Имя пользователя</Label>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">Пароль</Label>
            <div className="relative">
              <Input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="········"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                aria-required="true"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? (
                  <EyeOff aria-hidden className="size-4" />
                ) : (
                  <Eye aria-hidden className="size-4" />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Вход…
              </>
            ) : (
              "Войти"
            )}
          </Button>
        </form>

        {authentikEnabled && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">или</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <a
              href={authentikHref}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Войти через Authentik
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
