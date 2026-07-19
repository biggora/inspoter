"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Bookmark } from "@/generated/prisma/client";
import { ApiError, bookmarkFaviconApi, bookmarksApi } from "./api";
import { ColorPicker } from "./color-picker";
import { isValidHttpUrl } from "./validation";

export type BookmarkDialogState =
  { mode: "create"; categoryId: string } | { mode: "edit"; bookmark: Bookmark };

interface BookmarkDialogProps {
  state: BookmarkDialogState | null;
  categories: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FieldErrors {
  name?: string;
  url?: string;
}

// AC-BM-006..009/011 (design.md §3.3.4). Category intentionally uses the
// NativeSelect primitive so browser select/option semantics remain available.
export function BookmarkDialog({
  state,
  categories,
  onOpenChange,
  onSaved,
}: BookmarkDialogProps) {
  const t = useTranslations("bookmarks");
  const nameId = useId();
  const urlId = useId();
  const iconId = useId();
  const descriptionId = useId();
  const categoryFieldId = useId();
  const nameErrorId = useId();
  const urlErrorId = useId();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const isEdit = state?.mode === "edit";

  // Reset the form when the dialog target changes, using React's "adjust state
  // while rendering on prop change" pattern instead of an effect
  // (react.dev/reference/react/useState).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.mode === "edit") {
      const bookmark = state.bookmark;
      setName(bookmark.name);
      setUrl(bookmark.url);
      setIcon(bookmark.icon ?? "");
      setColor(bookmark.color ?? null);
      setDescription(bookmark.description ?? "");
      setCategory(bookmark.categoryId);
    } else if (state?.mode === "create") {
      setName("");
      setUrl("");
      setIcon("");
      setColor(null);
      setDescription("");
      setCategory(state.categoryId);
    }
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const nextErrors: FieldErrors = {};
    if (!trimmedName) nextErrors.name = t("nameRequiredError");
    if (!trimmedUrl) nextErrors.url = t("urlRequiredError");
    else if (!isValidHttpUrl(trimmedUrl)) {
      nextErrors.url = t("urlInvalidError");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        url: trimmedUrl,
        icon: icon.trim() || null,
        color,
        description: description.trim() || null,
        categoryId: category,
      };
      if (state?.mode === "edit") {
        await bookmarksApi.update(state.bookmark.id, payload);
        toast.success(t("bookmarkUpdatedToast"));
      } else {
        await bookmarksApi.create(payload);
        toast.success(t("bookmarkCreatedToast"));
      }
      onSaved();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.fieldErrors &&
        Object.keys(err.fieldErrors).length > 0
      ) {
        setErrors({ name: err.fieldErrors.name, url: err.fieldErrors.url });
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("saveBookmarkError"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSuggestFavicon() {
    setSuggesting(true);
    try {
      const result = await bookmarkFaviconApi.suggest(url.trim());
      if (result.icon) {
        setIcon(result.icon);
      } else {
        toast.error(t("suggestFaviconError"));
      }
    } catch {
      toast.error(t("suggestFaviconError"));
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editBookmarkTitle") : t("createBookmarkTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor={nameId}>{t("nameLabel")}</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? nameErrorId : undefined}
                autoFocus
              />
              <FieldError id={nameErrorId}>{errors.name}</FieldError>
            </Field>

            <Field data-invalid={!!errors.url || undefined}>
              <FieldLabel htmlFor={urlId}>URL</FieldLabel>
              <Input
                id={urlId}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                aria-required="true"
                aria-invalid={!!errors.url || undefined}
                aria-describedby={errors.url ? urlErrorId : undefined}
                placeholder="https://"
              />
              <FieldError id={urlErrorId}>{errors.url}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={iconId}>{t("iconLabel")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={iconId}
                  value={icon}
                  onChange={(event) => setIcon(event.target.value)}
                  placeholder={t("iconPlaceholder")}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    variant="outline"
                    size="sm"
                    disabled={!isValidHttpUrl(url.trim()) || suggesting}
                    onClick={handleSuggestFavicon}
                  >
                    {suggesting ? t("suggestingButton") : t("suggestButton")}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            <ColorPicker value={color} onChange={setColor} />

            <Field>
              <FieldLabel htmlFor={descriptionId}>
                {t("descriptionLabel")}
              </FieldLabel>
              <Textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor={categoryFieldId}>
                {t("categoryLabel")}
              </FieldLabel>
              <NativeSelect
                id={categoryFieldId}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                required
                className="w-full"
              >
                {categories.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancelButton")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {isEdit ? (
                submitting ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    {t("savingButton")}
                  </>
                ) : (
                  t("saveChangesButton")
                )
              ) : submitting ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden />
                  {t("creatingButton")}
                </>
              ) : (
                t("createButton")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
