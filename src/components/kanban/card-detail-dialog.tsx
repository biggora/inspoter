"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/mail/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
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
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { KANBAN_LINK_TYPES } from "@/lib/validation/kanban";
import type { KanbanCardDetail } from "@/lib/services/kanban";
import type { KanbanLabelListItem } from "@/lib/services/kanban-labels";
import type { KanbanLinkTargets } from "@/lib/services/kanban-link-targets";
import { cn } from "@/lib/utils";
import {
  ApiError,
  cardsApi,
  checklistApi,
  commentsApi,
  linkTargetsApi,
  type ChecklistItemDto,
  type CommentDto,
} from "./api";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const NO_LINK = "__none__";
const NO_ASSIGNEE = "__none__";

const EMPTY_LINK_TARGETS: KanbanLinkTargets = {
  SERVER: [],
  DOMAIN: [],
  SERVICE: [],
  ALERT: [],
  HOSTING_ACCOUNT: [],
};

export type CardDialogState =
  | { mode: "create"; columnId: string; prefill?: CardPrefill }
  | { mode: "edit"; card: KanbanCardDetail };

/** Lets another section (Alerts) open the dialog with a link already set. */
export interface CardPrefill {
  title?: string;
  linkedType?: string;
  linkedId?: string;
  linkedLabel?: string;
}

interface CardDetailDialogProps {
  state: CardDialogState | null;
  columns: { id: string; name: string }[];
  labels: KanbanLabelListItem[];
  members: { operatorId: string; username: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onRequestDelete: (card: { id: string; title: string }) => void;
}

/** `<input type="date">` wants YYYY-MM-DD; the API speaks ISO-8601. */
function toDateInput(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function CardDetailDialog({
  state,
  columns,
  labels,
  members,
  onOpenChange,
  onSaved,
  onRequestDelete,
}: CardDetailDialogProps) {
  const t = useTranslations("kanban");
  const format = useFormatter();
  const titleId = useId();
  const descriptionId = useId();
  const descriptionLabelId = useId();
  const dueId = useId();
  const errorId = useId();
  const checklistInputId = useId();
  const commentInputId = useId();

  const card = state?.mode === "edit" ? state.card : null;
  const dialogOpen = state !== null;

  const [title, setTitle] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [columnId, setColumnId] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>(NO_ASSIGNEE);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [linkType, setLinkType] = useState<string>(NO_LINK);
  const [linkId, setLinkId] = useState<string>("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [checklist, setChecklist] = useState<ChecklistItemDto[]>([]);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [commentDraft, setCommentDraft] = useState("");

  // Checklist and comment mutations persist straight to the server but bypass
  // `handleSave`/`onSaved`, so the board's card counts (checklist progress,
  // comment chip) would stay stale until a manual reload. Tracking whether any
  // such mutation landed lets `onOpenChange` trigger a refresh on close.
  const dirtyRef = useRef(false);

  // `null` doubles as "not loaded yet": the fetch below is fired once per
  // mount and resolves to an empty set on failure, so there is no separate
  // loading flag to keep in sync.
  const [linkTargets, setLinkTargets] = useState<KanbanLinkTargets | null>(
    null,
  );
  const linkTargetsLoading = linkTargets === null;

  // Reset on target change during render, the same pattern the other dialogs
  // use — an effect would render one frame of the previous card's data.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    const prefill = state?.mode === "create" ? state.prefill : undefined;
    setTitle(card?.title ?? prefill?.title ?? "");
    setDescriptionHtml(card?.description ?? "");
    setColumnId(
      card?.columnId ?? (state?.mode === "create" ? state.columnId : ""),
    );
    setPriority(card?.priority ?? "MEDIUM");
    setDueDate(toDateInput(card?.dueDate ?? null));
    setAssignee(card?.assignee?.operatorId ?? NO_ASSIGNEE);
    setLabelIds(card?.labels.map((label) => label.id) ?? []);
    setLinkType(card?.linkedType ?? prefill?.linkedType ?? NO_LINK);
    setLinkId(card?.linkedId ?? prefill?.linkedId ?? "");
    setError(undefined);
    setChecklist([]);
    setComments([]);
    setChecklistDraft("");
    setCommentDraft("");
  }

  // Checklist and comments are card-scoped and only exist once the card does,
  // so they load when an existing card opens rather than with the board.
  useEffect(() => {
    if (!card) return;
    // A freshly opened (or switched-to) card has no in-flight edits, so the
    // dirty flag — which drives the close-time board refresh — resets here.
    dirtyRef.current = false;
    let cancelled = false;
    Promise.all([checklistApi.list(card.id), commentsApi.list(card.id)])
      .then(([items, thread]) => {
        if (cancelled) return;
        setChecklist(items);
        setComments(thread);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("genericError"));
      });
    return () => {
      cancelled = true;
    };
  }, [card, t]);

  // Link options are fetched lazily — the hosting list behind them reads a
  // provider snapshot that can trigger a refresh fan-out, which must not sit
  // on the board's render path. A provider being down degrades the picker to
  // "no records", never to a stuck spinner.
  // Keyed on "is the dialog open", not on which card it shows: the option
  // lists are workspace-wide, so switching cards must not re-fetch them.
  useEffect(() => {
    if (!dialogOpen) return;
    let cancelled = false;
    linkTargetsApi
      .list()
      .then((targets) => {
        if (!cancelled) setLinkTargets(targets);
      })
      .catch(() => {
        if (!cancelled) setLinkTargets(EMPTY_LINK_TARGETS);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen]);

  const linkOptions =
    linkType === NO_LINK || !linkTargets
      ? []
      : (linkTargets[linkType as keyof KanbanLinkTargets] ?? []);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("errors.LABEL_NAME_REQUIRED"));
      return;
    }

    const linkedLabel =
      linkType === NO_LINK
        ? null
        : (linkOptions.find((option) => option.id === linkId)?.name ??
          card?.linkedLabel ??
          null);

    const payload = {
      title: trimmed,
      description: descriptionHtml || null,
      priority,
      // The date input has no time component; midnight UTC keeps the stored
      // value stable regardless of where the operator sits.
      dueDate: dueDate
        ? new Date(`${dueDate}T00:00:00.000Z`).toISOString()
        : null,
      assigneeOperatorId: assignee === NO_ASSIGNEE ? null : assignee,
      linkedType: linkType === NO_LINK || !linkId ? null : linkType,
      linkedId: linkType === NO_LINK || !linkId ? null : linkId,
      linkedLabel: linkType === NO_LINK || !linkId ? null : linkedLabel,
    };

    setSubmitting(true);
    try {
      if (card) {
        await cardsApi.update(card.id, payload);
        await cardsApi.setLabels(card.id, labelIds);
      } else {
        await cardsApi.create({ ...payload, columnId, labelIds });
      }
      toast.success(card ? t("updatedToast") : t("createdToast"));
      // Save already drives the board refresh through `onSaved`; clearing the
      // dirty flag prevents a second refresh when the dialog closes.
      dirtyRef.current = false;
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setError(err.fieldErrors.title ?? err.message);
      } else {
        toast.error(t("genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function addChecklistItem() {
    const text = checklistDraft.trim();
    if (!card || !text) return;
    try {
      const item = await checklistApi.add(card.id, text);
      setChecklist((items) => [...items, item]);
      setChecklistDraft("");
      dirtyRef.current = true;
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function toggleChecklistItem(item: ChecklistItemDto) {
    try {
      const updated = await checklistApi.update(item.id, {
        isDone: !item.isDone,
      });
      setChecklist((items) =>
        items.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      dirtyRef.current = true;
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function removeChecklistItem(item: ChecklistItemDto) {
    try {
      await checklistApi.remove(item.id);
      setChecklist((items) => items.filter((entry) => entry.id !== item.id));
      dirtyRef.current = true;
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function addComment() {
    const body = commentDraft.trim();
    if (!card || !body) return;
    try {
      const comment = await commentsApi.add(card.id, body);
      setComments((thread) => [...thread, comment]);
      setCommentDraft("");
      dirtyRef.current = true;
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function removeComment(comment: CommentDto) {
    try {
      await commentsApi.remove(comment.id);
      setComments((thread) =>
        thread.filter((entry) => entry.id !== comment.id),
      );
      dirtyRef.current = true;
    } catch {
      toast.error(t("genericError"));
    }
  }

  const columnItems: Record<string, string> = Object.fromEntries(
    columns.map((column) => [column.id, column.name]),
  );
  const priorityItems: Record<string, string> = Object.fromEntries(
    PRIORITIES.map((value) => [value, t(`priorities.${value}`)]),
  );
  const assigneeItems: Record<string, string> = {
    [NO_ASSIGNEE]: t("cardUnassigned"),
    ...Object.fromEntries(
      members.map((member) => [member.operatorId, member.username]),
    ),
  };
  const linkTypeItems: Record<string, string> = {
    [NO_LINK]: t("cardDialogLinkNone"),
    ...Object.fromEntries(
      KANBAN_LINK_TYPES.map((type) => [type, t(`linkTypes.${type}`)]),
    ),
  };
  const linkTargetItems: Record<string, string> = Object.fromEntries(
    linkOptions.map((option) => [option.id, option.name]),
  );

  // Closing after a checklist/comment edit must push those changes to the
  // board (card counts), so a dirty close fires `onSaved` (which the board
  // wires to `router.refresh()`) in addition to the usual teardown through
  // `onOpenChange`. Calling only `onSaved` would refresh the board but leave
  // the dialog open, since `onOpenChange` is what clears the dialog state.
  function handleOpenChange(open: boolean): void {
    const dirty = dirtyRef.current;
    dirtyRef.current = false;
    if (!open && dirty) {
      onSaved();
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={state !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {card ? card.title : t("cardDialogCreateTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor={titleId}>
                {t("cardDialogTitleLabel")}
              </FieldLabel>
              <Input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("cardDialogTitlePlaceholder")}
                aria-required="true"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              <FieldError id={errorId}>{error}</FieldError>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${titleId}-column`}>
                  {t("cardDialogColumnLabel")}
                </FieldLabel>
                <Select
                  value={columnId}
                  onValueChange={(value) => setColumnId(value as string)}
                  items={columnItems}
                  disabled={card !== null}
                >
                  <SelectTrigger
                    id={`${titleId}-column`}
                    aria-label={t("cardDialogColumnLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {columns.map((column) => (
                        <SelectItem key={column.id} value={column.id}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor={`${titleId}-priority`}>
                  {t("cardDialogPriorityLabel")}
                </FieldLabel>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as string)}
                  items={priorityItems}
                >
                  <SelectTrigger
                    id={`${titleId}-priority`}
                    aria-label={t("cardDialogPriorityLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {PRIORITIES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`priorities.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor={dueId}>
                  {t("cardDialogDueDateLabel")}
                </FieldLabel>
                <Input
                  id={dueId}
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={`${titleId}-assignee`}>
                  {t("cardDialogAssigneeLabel")}
                </FieldLabel>
                <Select
                  value={assignee}
                  onValueChange={(value) => setAssignee(value as string)}
                  items={assigneeItems}
                >
                  <SelectTrigger
                    id={`${titleId}-assignee`}
                    aria-label={t("cardDialogAssigneeLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(assigneeItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel id={descriptionLabelId} htmlFor={descriptionId}>
                {t("cardDialogDescriptionLabel")}
              </FieldLabel>
              <RichTextEditor
                id={descriptionId}
                labelledBy={descriptionLabelId}
                compact
                initialHtml={card?.description ?? "<p></p>"}
                onChange={(value) =>
                  setDescriptionHtml(value.isEmpty ? "" : value.html)
                }
                onSubmitShortcut={handleSave}
                labels={{
                  toolbar: t("editorToolbarLabel"),
                  bold: t("editorBold"),
                  italic: t("editorItalic"),
                  underline: t("editorUnderline"),
                  bulletList: t("editorBulletList"),
                  orderedList: t("editorOrderedList"),
                  blockquote: t("editorBlockquote"),
                  link: t("editorLink"),
                  linkUrl: t("editorLinkUrl"),
                  applyLink: t("editorApplyLink"),
                  removeLink: t("editorRemoveLink"),
                  clearFormatting: t("editorClearFormatting"),
                  undo: t("editorUndo"),
                  redo: t("editorRedo"),
                }}
              />
            </Field>

            {labels.length > 0 && (
              <Field>
                <FieldLabel>{t("cardDialogLabelsLabel")}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => {
                    const selected = labelIds.includes(label.id);
                    return (
                      <Button
                        key={label.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={selected}
                        onClick={() =>
                          setLabelIds((current) =>
                            selected
                              ? current.filter((id) => id !== label.id)
                              : [...current, label.id],
                          )
                        }
                        className={cn(
                          "h-auto rounded-full p-0.5",
                          !selected && "opacity-45",
                        )}
                      >
                        <LabelChip label={label} />
                      </Button>
                    );
                  })}
                </div>
              </Field>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${titleId}-link-type`}>
                  {t("cardDialogLinkTypeLabel")}
                </FieldLabel>
                <Select
                  value={linkType}
                  onValueChange={(value) => {
                    setLinkType(value as string);
                    setLinkId("");
                  }}
                  items={linkTypeItems}
                >
                  <SelectTrigger
                    id={`${titleId}-link-type`}
                    aria-label={t("cardDialogLinkTypeLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(linkTypeItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              {linkType !== NO_LINK && (
                <Field>
                  <FieldLabel htmlFor={`${titleId}-link-target`}>
                    {t("cardDialogLinkTargetLabel")}
                  </FieldLabel>
                  {linkTargetsLoading ? (
                    <p className="text-xs text-muted-foreground">
                      {t("cardDialogLinkLoading")}
                    </p>
                  ) : linkOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("cardDialogLinkEmpty")}
                    </p>
                  ) : (
                    <Select
                      value={linkId}
                      onValueChange={(value) => setLinkId(value as string)}
                      items={linkTargetItems}
                    >
                      <SelectTrigger
                        id={`${titleId}-link-target`}
                        aria-label={t("cardDialogLinkTargetLabel")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {linkOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
            </div>
          </FieldGroup>

          {/* Checklist and comments belong to a card that already exists —
              there is nothing to attach them to while it is being created. */}
          {card && (
            <>
              <Separator />

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground-900">
                  {t("cardDialogChecklistLabel")}
                </h3>
                <ul className="flex flex-col gap-1">
                  {checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`${checklistInputId}-${item.id}`}
                        checked={item.isDone}
                        aria-label={t("cardDialogChecklistToggleLabel", {
                          text: item.text,
                        })}
                        onCheckedChange={() => toggleChecklistItem(item)}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-sm",
                          item.isDone &&
                            "text-foreground-400 line-through decoration-1",
                        )}
                      >
                        {item.text}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("cardDialogChecklistDeleteLabel", {
                          text: item.text,
                        })}
                        onClick={() => removeChecklistItem(item)}
                      >
                        <Icon name="ri-close-line" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Input
                    id={checklistInputId}
                    value={checklistDraft}
                    onChange={(event) => setChecklistDraft(event.target.value)}
                    placeholder={t("cardDialogChecklistPlaceholder")}
                    aria-label={t("cardDialogChecklistPlaceholder")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addChecklistItem();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addChecklistItem}
                  >
                    {t("cardDialogChecklistAdd")}
                  </Button>
                </div>
              </section>

              <Separator />

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-foreground-900">
                  {t("cardDialogCommentsLabel")}
                </h3>
                {comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("cardDialogCommentsEmpty")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {comments.map((comment) => (
                      <li key={comment.id} className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-foreground-500">
                            <span className="font-medium text-foreground-700">
                              {comment.authorName}
                            </span>{" "}
                            {format.dateTime(new Date(comment.createdAt), {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                          <p className="mt-0.5 text-sm whitespace-pre-wrap text-foreground-900">
                            {comment.body}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("cardDialogCommentDeleteLabel")}
                          onClick={() => removeComment(comment)}
                        >
                          <Icon name="ri-delete-bin-line" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-2">
                  <Textarea
                    id={commentInputId}
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder={t("cardDialogCommentPlaceholder")}
                    aria-label={t("cardDialogCommentPlaceholder")}
                    rows={2}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={addComment}
                  >
                    {t("cardDialogCommentSubmit")}
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {card ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() =>
                onRequestDelete({ id: card.id, title: card.title })
              }
            >
              {t("cardDialogDeleteAction")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t("cancelButton")}
            </Button>
            <Button type="button" disabled={submitting} onClick={handleSave}>
              {submitting && <Spinner data-icon="inline-start" aria-hidden />}
              {card ? t("saveButton") : t("createButton")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
