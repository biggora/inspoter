"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, workspacesApi } from "./api";

interface FieldErrors {
  username?: string;
  password?: string;
}

// AC scope: Settings > Workspace, "Add member" form (task spec item 3).
// Password is optional — the API only uses it to create a brand-new
// Operator when `username` doesn't already exist (src/lib/services/
// workspaces.ts addMember); adding an existing operator by username needs
// no password.
export function AddMemberForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const usernameId = useId();
  const passwordId = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErrors({ username: "Имя пользователя обязательно." });
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      await workspacesApi.addMember(workspaceId, {
        username: trimmedUsername,
        password: password.trim() || undefined,
      });
      toast.success("Участник добавлен.");
      setUsername("");
      setPassword("");
      router.refresh();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({
          username: err.fieldErrors.username,
          password: err.fieldErrors.password,
        });
      } else {
        toast.error(
          err instanceof ApiError ? err.message : "Не удалось добавить участника.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={usernameId}>Имя пользователя</Label>
        <Input
          id={usernameId}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-required="true"
          aria-invalid={errors.username ? true : undefined}
        />
        {errors.username && (
          <p className="text-sm text-(--error-text)">{errors.username}</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={passwordId}>Пароль (только для нового пользователя)</Label>
        <Input
          id={passwordId}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={errors.password ? true : undefined}
        />
        {errors.password && (
          <p className="text-sm text-(--error-text)">{errors.password}</p>
        )}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Добавление…" : "Добавить участника"}
      </Button>
    </form>
  );
}
