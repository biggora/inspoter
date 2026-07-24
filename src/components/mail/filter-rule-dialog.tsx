"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
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
  createMailFilterRule,
  createMailLabel,
  fetchMailLabels,
  patchMailFilterRule,
  type MailDetailDto,
  type MailFilterRuleDto,
  type MailLabelColor,
  type MailLabelDto,
} from "./api";
import { LabelColorField } from "./label-color-field";

const CREATE_LABEL_VALUE = "__create_label__";

const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  LABEL_NAME_REQUIRED: "validationLabelNameRequired",
  LABEL_NAME_TOO_LONG: "validationLabelNameTooLong",
  LABEL_COLOR_INVALID: "validationLabelColorInvalid",
  RULE_NAME_REQUIRED: "validationRuleNameRequired",
  RULE_NAME_TOO_LONG: "validationRuleNameTooLong",
  RULE_PREDICATE_REQUIRED: "validationRulePredicateRequired",
  RULE_UPDATE_REQUIRED: "validationRuleUpdateRequired",
  SENDER_TOO_LONG: "validationSenderTooLong",
  SUBJECT_TOO_LONG: "validationSubjectTooLong",
  SUBJECT_FILTER_TOO_LONG: "validationSubjectTooLong",
  ACCOUNT_REQUIRED: "validationAccountRequired",
  LABEL_REQUIRED: "validationLabelRequired",
  LABEL_NAME_CONFLICT: "errorLabelNameConflict",
  LABEL_LIMIT_REACHED: "errorLabelLimitReached",
  ACTIVE_RULE_LIMIT_REACHED: "errorRuleLimitReached",
  RESOURCE_NOT_FOUND: "errorFilterResourceNotFound",
  WORKSPACE_MEMBER_REQUIRED: "errorMembershipRequired",
};

export interface FilterRuleFormProps {
  accountId: string;
  accountName: string;
  defaultFromAddress?: string;
  initialRule?: MailFilterRuleDto;
  onSaved: (result: FilterRuleSaveResult) => void;
  onCancel: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
}

export interface FilterRuleSaveResult {
  rule: MailFilterRuleDto;
  applyToExistingMail: boolean;
}

export function FilterRuleForm({
  accountId,
  accountName,
  defaultFromAddress = "",
  initialRule,
  onSaved,
  onCancel,
  onSubmittingChange,
}: FilterRuleFormProps) {
  const t = useTranslations("mail");
  const [labels, setLabels] = useState<MailLabelDto[] | null>(null);
  const [labelsError, setLabelsError] = useState(false);
  const [labelsReload, setLabelsReload] = useState(0);
  const [selectedLabelId, setSelectedLabelId] = useState(
    initialRule?.labelId ?? "",
  );
  const [ruleName, setRuleName] = useState(
    initialRule?.name ??
      t("filterRuleDefaultName", { sender: defaultFromAddress }),
  );
  const [fromAddress, setFromAddress] = useState(
    initialRule?.fromAddress ?? defaultFromAddress,
  );
  const [subjectContains, setSubjectContains] = useState(
    initialRule?.subjectContains ?? "",
  );
  const [applyToExistingMail, setApplyToExistingMail] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<MailLabelColor>("SLATE");
  const [newLabelColorValid, setNewLabelColorValid] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLabelsError(false);
      try {
        const result = await fetchMailLabels();
        if (cancelled) return;
        setLabels(result);
        setSelectedLabelId(
          (current) =>
            current ||
            initialRule?.labelId ||
            result[0]?.id ||
            CREATE_LABEL_VALUE,
        );
      } catch {
        if (!cancelled) setLabelsError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialRule?.labelId, labelsReload]);

  function translatedError(message: string): string {
    const key = ERROR_TRANSLATION_KEYS[message];
    return key ? t(key) : message;
  }

  function setPending(value: boolean) {
    setSubmitting(value);
    onSubmittingChange?.(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitting ||
      (selectedLabelId === CREATE_LABEL_VALUE && !newLabelColorValid)
    ) {
      return;
    }

    const normalizedFrom = fromAddress.normalize("NFKC").trim();
    const normalizedSubject = subjectContains.normalize("NFKC").trim();
    if (!normalizedFrom && !normalizedSubject) {
      setFieldErrors({
        predicate: t("validationRulePredicateRequired"),
      });
      return;
    }

    setPending(true);
    setFieldErrors({});
    let requestStage: "label" | "rule" = "rule";

    try {
      let labelId = selectedLabelId;
      if (labelId === CREATE_LABEL_VALUE) {
        requestStage = "label";
        const label = await createMailLabel({
          name: newLabelName,
          color: newLabelColor,
        });
        labelId = label.id;
        setLabels((current) =>
          current?.some((item) => item.id === label.id)
            ? current
            : [...(current ?? []), label],
        );
        setSelectedLabelId(label.id);
      }

      requestStage = "rule";
      const input = {
        labelId,
        name: ruleName,
        fromAddress: normalizedFrom || null,
        subjectContains: normalizedSubject || null,
      };
      let savedRule: MailFilterRuleDto;
      if (initialRule) {
        savedRule = await patchMailFilterRule(initialRule.id, input);
        toast.success(t("filterRuleUpdatedToast"));
      } else {
        savedRule = await createMailFilterRule({
          accountId,
          ...input,
          applyToExistingMail,
        });
        toast.success(t("filterRuleCreatedToast"));
      }
      onSaved({
        rule: savedRule,
        applyToExistingMail: !initialRule && applyToExistingMail,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fieldErrors) {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(error.fieldErrors).map(([field, message]) => [
                requestStage === "label" && field === "name"
                  ? "newLabelName"
                  : field,
                translatedError(message),
              ]),
            ),
          );
        } else {
          toast.error(translatedError(error.message));
        }
      } else {
        toast.error(
          initialRule ? t("errorUpdateFilterRule") : t("errorCreateFilterRule"),
        );
      }
    } finally {
      setPending(false);
    }
  }

  const labelItems = Object.fromEntries([
    ...(labels ?? []).map((label) => [label.id, label.name] as const),
    [CREATE_LABEL_VALUE, t("createLabelOption")],
  ]);
  const creatingLabel = selectedLabelId === CREATE_LABEL_VALUE;

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="filter-rule-account">
              {t("filterRuleAccountLabel")}
            </FieldLabel>
            <Input id="filter-rule-account" value={accountName} disabled />
          </Field>

          <Field data-invalid={Boolean(fieldErrors.name)}>
            <FieldLabel htmlFor="filter-rule-name">
              {t("filterRuleNameLabel")}
            </FieldLabel>
            <Input
              id="filter-rule-name"
              value={ruleName}
              onChange={(event) => setRuleName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              maxLength={80}
              disabled={submitting}
            />
            <FieldError>{fieldErrors.name}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.fromAddress)}>
            <FieldLabel htmlFor="filter-rule-sender">
              {t("filterRuleSenderLabel")}
            </FieldLabel>
            <Input
              id="filter-rule-sender"
              value={fromAddress}
              onChange={(event) => setFromAddress(event.target.value)}
              aria-invalid={Boolean(fieldErrors.fromAddress)}
              maxLength={320}
              disabled={submitting}
            />
            <FieldDescription>
              {t("filterRuleSenderDescription")}
            </FieldDescription>
            <FieldError>{fieldErrors.fromAddress}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.subjectContains)}>
            <FieldLabel htmlFor="filter-rule-subject">
              {t("filterRuleSubjectLabel")}
            </FieldLabel>
            <Input
              id="filter-rule-subject"
              value={subjectContains}
              onChange={(event) => setSubjectContains(event.target.value)}
              aria-invalid={Boolean(fieldErrors.subjectContains)}
              maxLength={200}
              disabled={submitting}
            />
            <FieldDescription>
              {t("filterRuleSubjectDescription")}
            </FieldDescription>
            <FieldError>{fieldErrors.subjectContains}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.predicate)}>
            <FieldDescription>{t("filterRuleAndDescription")}</FieldDescription>
            <FieldError>{fieldErrors.predicate}</FieldError>
          </Field>

          <Field data-invalid={Boolean(fieldErrors.labelId)}>
            <FieldLabel>{t("filterRuleLabelLabel")}</FieldLabel>
            {labelsError ? (
              <div className="space-y-2">
                <FieldError>{t("errorLoadLabels")}</FieldError>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => {
                    setLabels(null);
                    setLabelsError(false);
                    setLabelsReload((value) => value + 1);
                  }}
                >
                  <Icon
                    name="ri-refresh-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t("retryButton")}
                </Button>
              </div>
            ) : labels === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-label={t("loadingLabelsLabel")} />
                {t("loadingLabelsLabel")}
              </div>
            ) : (
              <Select
                value={selectedLabelId}
                onValueChange={(value) => setSelectedLabelId(value ?? "")}
                items={labelItems}
                disabled={submitting}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("filterRuleLabelLabel")}
                  aria-invalid={Boolean(fieldErrors.labelId)}
                >
                  <SelectValue placeholder={t("filterRuleLabelPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(labelItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <FieldError>{fieldErrors.labelId}</FieldError>
          </Field>

          {creatingLabel && labels !== null && (
            <>
              <Field data-invalid={Boolean(fieldErrors.newLabelName)}>
                <FieldLabel htmlFor="new-label-name">
                  {t("newLabelNameLabel")}
                </FieldLabel>
                <Input
                  id="new-label-name"
                  value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.newLabelName)}
                  maxLength={40}
                  disabled={submitting}
                />
                <FieldError>{fieldErrors.newLabelName}</FieldError>
              </Field>
              <LabelColorField
                value={newLabelColor}
                onChange={setNewLabelColor}
                onValidityChange={setNewLabelColorValid}
                disabled={submitting}
              />
            </>
          )}

          {!initialRule && (
            <Field orientation="horizontal">
              <Checkbox
                id="filter-rule-apply-existing"
                checked={applyToExistingMail}
                onCheckedChange={(value) =>
                  setApplyToExistingMail(value === true)
                }
                disabled={submitting}
              />
              <FieldContent>
                <FieldLabel
                  htmlFor="filter-rule-apply-existing"
                  className="cursor-pointer font-normal"
                >
                  {t("filterRuleApplyExistingLabel")}
                </FieldLabel>
                <FieldDescription>
                  {t("filterRuleApplyExistingDescription")}
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        </FieldGroup>
      </div>

      <div className="mx-0 mb-0 flex shrink-0 flex-col-reverse gap-2 rounded-none border-t border-background-100 p-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onCancel}
        >
          {t("cancelButton")}
        </Button>
        <Button
          type="submit"
          disabled={
            submitting ||
            labels === null ||
            labelsError ||
            (creatingLabel && !newLabelColorValid)
          }
        >
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting
            ? t("savingFilterRuleLabel")
            : initialRule
              ? t("updateFilterRuleButton")
              : t("saveFilterRuleButton")}
        </Button>
      </div>
    </form>
  );
}

export interface FilterRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: MailDetailDto;
  accountName: string;
  onSaved: (result: FilterRuleSaveResult) => void;
}

export function FilterRuleDialog({
  open,
  onOpenChange,
  detail,
  accountName,
  onSaved,
}: FilterRuleDialogProps) {
  const t = useTranslations("mail");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting || nextOpen) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-background-100 p-4 pr-12">
          <DialogTitle>{t("filterRuleDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("filterRuleDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <FilterRuleForm
          accountId={detail.accountId}
          accountName={accountName}
          defaultFromAddress={detail.from}
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
          onSubmittingChange={setSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
