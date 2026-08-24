"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
  fetchFolders,
  fetchMailLabels,
  patchMailFilterRule,
  type MailAiFilterProposalDto,
  type MailDetailDto,
  type MailFilterConditionInput,
  type MailFilterMatchMode,
  type MailFilterRuleDto,
  type MailFolderDto,
  type MailLabelColor,
  type MailLabelDto,
} from "./api";
import { LabelColorField } from "./label-color-field";
import {
  MAIL_FILTER_CONDITION_FIELDS,
  MAX_MAIL_FILTER_CONDITIONS,
  defaultMailFilterOperator,
  mailFilterOperatorsForField,
  type MailFilterConditionField,
  type MailFilterConditionOperator,
} from "@/lib/mail-filter-types";

const CREATE_LABEL_VALUE = "__create_label__";
const KEEP_FOLDER_VALUE = "__keep_folder__";

type ReadAction = "KEEP" | "READ" | "UNREAD";

const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  LABEL_NAME_REQUIRED: "validationLabelNameRequired",
  LABEL_NAME_TOO_LONG: "validationLabelNameTooLong",
  LABEL_COLOR_INVALID: "validationLabelColorInvalid",
  RULE_NAME_REQUIRED: "validationRuleNameRequired",
  RULE_NAME_TOO_LONG: "validationRuleNameTooLong",
  RULE_PREDICATE_REQUIRED: "validationRulePredicateRequired",
  RULE_CONDITION_VALUE_REQUIRED: "validationRuleConditionValueRequired",
  RULE_CONDITION_VALUE_TOO_LONG: "validationRuleConditionValueTooLong",
  RULE_CONDITION_VALUE_INVALID: "validationRuleConditionValueInvalid",
  RULE_CONDITION_OPERATOR_INVALID: "validationRuleConditionOperatorInvalid",
  RULE_TOO_MANY_CONDITIONS: "validationRuleTooManyConditions",
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
  /**
   * A model's suggestion, used only to pre-fill the form. Nothing is stored:
   * the rule is created by the operator's submit, and the label — which the
   * model never proposes — still has to be chosen here, so confirmation is
   * structural rather than a courtesy step.
   */
  proposal?: MailAiFilterProposalDto;
  onSaved: (result: FilterRuleSaveResult) => void;
  onCancel: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
}

export interface FilterRuleSaveResult {
  rule: MailFilterRuleDto;
  applyToExistingMail: boolean;
}

interface MailFilterConditionDraft extends MailFilterConditionInput {
  key: string;
}

function initialConditions(
  initialRule: MailFilterRuleDto | undefined,
  defaultFromAddress: string,
  proposal?: MailAiFilterProposalDto,
): MailFilterConditionDraft[] {
  const stored = initialRule?.conditions;
  if (stored && stored.length > 0) {
    return stored.map(({ id, field, operator, value, isNegated }) => ({
      key: id,
      field,
      operator,
      value,
      isNegated,
    }));
  }

  // Checked after initialRule on purpose: editing an existing rule always
  // wins over a suggestion. Conditions here already passed the server-side
  // sanitizer, so they are the same shape an operator could have typed.
  if (proposal && proposal.conditions.length > 0) {
    return proposal.conditions.map((condition, index) => ({
      key: `proposed-${index}`,
      ...condition,
    }));
  }

  const conditions: MailFilterConditionDraft[] = [];
  if (initialRule?.fromAddress || defaultFromAddress) {
    conditions.push({
      key: "initial-sender",
      field: "FROM_ADDRESS",
      operator: "EQUALS",
      value: initialRule?.fromAddress ?? defaultFromAddress,
      isNegated: false,
    });
  }
  if (initialRule?.subjectContains) {
    conditions.push({
      key: "initial-subject",
      field: "SUBJECT",
      operator: "CONTAINS",
      value: initialRule.subjectContains,
      isNegated: false,
    });
  }
  return conditions.length > 0
    ? conditions
    : [
        {
          key: "initial-empty",
          field: "FROM_ADDRESS",
          operator: "EQUALS",
          value: "",
          isNegated: false,
        },
      ];
}

export function FilterRuleForm({
  accountId,
  accountName,
  defaultFromAddress = "",
  initialRule,
  proposal,
  onSaved,
  onCancel,
  onSubmittingChange,
}: FilterRuleFormProps) {
  const t = useTranslations("mail");
  const [labels, setLabels] = useState<MailLabelDto[] | null>(null);
  const [labelsError, setLabelsError] = useState(false);
  const [labelsReload, setLabelsReload] = useState(0);
  const [folders, setFolders] = useState<MailFolderDto[] | null>(null);
  const [foldersError, setFoldersError] = useState(false);
  const [foldersReload, setFoldersReload] = useState(0);
  const [selectedLabelId, setSelectedLabelId] = useState(
    initialRule?.labelId ?? "",
  );
  const [ruleName, setRuleName] = useState(
    initialRule?.name ??
      proposal?.name ??
      t("filterRuleDefaultName", { sender: defaultFromAddress }),
  );
  const [matchMode, setMatchMode] = useState<MailFilterMatchMode>(
    initialRule?.matchMode ?? proposal?.matchMode ?? "ALL",
  );
  const [readAction, setReadAction] = useState<ReadAction>(
    initialRule?.setRead === true
      ? "READ"
      : initialRule?.setRead === false
        ? "UNREAD"
        : "KEEP",
  );
  const [moveToFolderId, setMoveToFolderId] = useState(
    initialRule?.moveToFolderId ?? KEEP_FOLDER_VALUE,
  );
  const [conditions, setConditions] = useState<MailFilterConditionDraft[]>(() =>
    initialConditions(initialRule, defaultFromAddress, proposal),
  );
  const nextConditionKey = useRef(conditions.length);
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setFoldersError(false);
      try {
        const result = await fetchFolders(accountId);
        if (cancelled) return;
        setFolders(result);
      } catch {
        if (!cancelled) setFoldersError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accountId, foldersReload]);

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

    const normalizedConditions = conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value.normalize("NFKC").trim(),
      isNegated: condition.isNegated,
    }));
    if (normalizedConditions.some((condition) => !condition.value)) {
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
        matchMode,
        conditions: normalizedConditions,
        setRead: readAction === "KEEP" ? null : readAction === "READ",
        moveToFolderId:
          moveToFolderId === KEEP_FOLDER_VALUE ? null : moveToFolderId,
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
          const translated = Object.fromEntries(
            Object.entries(error.fieldErrors).map(([field, message]) => [
              requestStage === "label" && field === "name"
                ? "newLabelName"
                : field,
              translatedError(message),
            ]),
          );
          const conditionError = Object.entries(translated).find(
            ([field]) =>
              field === "fromAddress" ||
              field === "subjectContains" ||
              field.startsWith("conditions"),
          )?.[1];
          setFieldErrors(
            conditionError
              ? { ...translated, predicate: conditionError }
              : translated,
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
  const folderItems = Object.fromEntries([
    [KEEP_FOLDER_VALUE, t("filterRuleMoveKeepOption")],
    ...(folders ?? []).map((folder) => [folder.id, folder.name] as const),
  ]);

  function updateCondition(
    index: number,
    update:
      Partial<MailFilterConditionInput> | { field: MailFilterConditionField },
  ) {
    setConditions((current) =>
      current.map((condition, conditionIndex) => {
        if (conditionIndex !== index) return condition;
        if (update.field && update.field !== condition.field) {
          return {
            ...condition,
            ...update,
            operator: defaultMailFilterOperator(update.field),
            value: update.field === "HAS_ATTACHMENT" ? "true" : "",
          };
        }
        return { ...condition, ...update };
      }),
    );
  }

  function addCondition() {
    if (conditions.length >= MAX_MAIL_FILTER_CONDITIONS) return;
    const key = `condition-${nextConditionKey.current}`;
    nextConditionKey.current += 1;
    setConditions((current) => [
      ...current,
      {
        key,
        field: "SUBJECT",
        operator: "CONTAINS",
        value: "",
        isNegated: false,
      },
    ]);
  }

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

          <Field>
            <FieldLabel>{t("filterRuleMatchModeLabel")}</FieldLabel>
            <Select
              value={matchMode}
              onValueChange={(value) =>
                setMatchMode((value as MailFilterMatchMode | null) ?? "ALL")
              }
              items={{
                ALL: t("filterRuleMatchAllOption"),
                ANY: t("filterRuleMatchAnyOption"),
              }}
              disabled={submitting}
            >
              <SelectTrigger
                className="w-full"
                aria-label={t("filterRuleMatchModeLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="ALL">
                    {t("filterRuleMatchAllOption")}
                  </SelectItem>
                  <SelectItem value="ANY">
                    {t("filterRuleMatchAnyOption")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          {proposal && (
            <div className="flex flex-col gap-2">
              {proposal.reason && (
                <p className="text-xs text-muted-foreground">
                  {t("aiProposalReasonLabel", { reason: proposal.reason })}
                </p>
              )}
              {proposal.droppedConditions > 0 && (
                // Saying so is deliberate. Dropping a model's condition
                // silently is exactly the hidden decision
                // specs/ai-integration.md forbids, even though the alternative
                // reads as an admission.
                <Alert>
                  <AlertDescription>
                    {t("aiProposalDroppedConditionsNotice", {
                      count: proposal.droppedConditions,
                    })}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <Field data-invalid={Boolean(fieldErrors.predicate)}>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>{t("filterRuleConditionsLabel")}</FieldLabel>
              <span className="text-xs text-muted-foreground tabular-nums">
                {conditions.length}/{MAX_MAIL_FILTER_CONDITIONS}
              </span>
            </div>
            <div className="space-y-3">
              {conditions.map((condition, index) => {
                const operators = mailFilterOperatorsForField(condition.field);
                const valueId = `filter-rule-condition-${index}-value`;
                const negateId = `filter-rule-condition-${index}-negated`;
                const valueLabel =
                  condition.field === "FROM_ADDRESS"
                    ? t("filterRuleSenderLabel")
                    : condition.field === "SUBJECT"
                      ? t("filterRuleSubjectLabel")
                      : t("filterRuleConditionValueLabel", {
                          number: index + 1,
                        });
                return (
                  <div
                    key={condition.key}
                    className="space-y-2 rounded-lg border border-background-200 bg-background-50 p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={condition.field}
                        onValueChange={(value) =>
                          value &&
                          updateCondition(index, {
                            field: value as MailFilterConditionField,
                          })
                        }
                        items={Object.fromEntries(
                          MAIL_FILTER_CONDITION_FIELDS.map((field) => [
                            field,
                            t(`filterRuleConditionField${field}`),
                          ]),
                        )}
                        disabled={submitting}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={t("filterRuleConditionFieldLabel", {
                            number: index + 1,
                          })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {MAIL_FILTER_CONDITION_FIELDS.map((field) => (
                              <SelectItem key={field} value={field}>
                                {t(`filterRuleConditionField${field}`)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>

                      <Select
                        value={condition.operator}
                        onValueChange={(value) =>
                          value &&
                          updateCondition(index, {
                            operator: value as MailFilterConditionOperator,
                          })
                        }
                        items={Object.fromEntries(
                          operators.map((operator) => [
                            operator,
                            t(`filterRuleConditionOperator${operator}`),
                          ]),
                        )}
                        disabled={submitting}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={t("filterRuleConditionOperatorLabel", {
                            number: index + 1,
                          })}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {operators.map((operator) => (
                              <SelectItem key={operator} value={operator}>
                                {t(`filterRuleConditionOperator${operator}`)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    {condition.field === "HAS_ATTACHMENT" ? (
                      <Select
                        value={condition.value}
                        onValueChange={(value) =>
                          value && updateCondition(index, { value })
                        }
                        items={{
                          true: t("filterRuleConditionBooleanYes"),
                          false: t("filterRuleConditionBooleanNo"),
                        }}
                        disabled={submitting}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={valueLabel}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="true">
                              {t("filterRuleConditionBooleanYes")}
                            </SelectItem>
                            <SelectItem value="false">
                              {t("filterRuleConditionBooleanNo")}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={valueId}
                        value={condition.value}
                        onChange={(event) =>
                          updateCondition(index, {
                            value: event.target.value,
                          })
                        }
                        aria-label={valueLabel}
                        maxLength={500}
                        disabled={submitting}
                      />
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <Field orientation="horizontal" className="min-h-8 gap-2">
                        <Checkbox
                          id={negateId}
                          checked={condition.isNegated}
                          onCheckedChange={(value) =>
                            updateCondition(index, {
                              isNegated: value === true,
                            })
                          }
                          disabled={submitting}
                        />
                        <FieldLabel
                          htmlFor={negateId}
                          className="cursor-pointer font-normal"
                        >
                          {t("filterRuleConditionNegateLabel")}
                        </FieldLabel>
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={submitting || conditions.length === 1}
                        aria-label={t("removeFilterRuleConditionButton", {
                          number: index + 1,
                        })}
                        onClick={() =>
                          setConditions((current) =>
                            current.filter(
                              (_condition, conditionIndex) =>
                                conditionIndex !== index,
                            ),
                          )
                        }
                      >
                        <Icon name="ri-delete-bin-line" aria-hidden />
                        {t("removeButton")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                submitting || conditions.length >= MAX_MAIL_FILTER_CONDITIONS
              }
              onClick={addCondition}
            >
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addFilterRuleConditionButton")}
            </Button>
            <FieldDescription>
              {t("filterRuleConditionsDescription")}
            </FieldDescription>
            <FieldError>
              {fieldErrors.predicate ?? fieldErrors.conditions}
            </FieldError>
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

          <Field>
            <FieldLabel>{t("filterRuleReadActionLabel")}</FieldLabel>
            <Select
              value={readAction}
              onValueChange={(value) =>
                setReadAction((value as ReadAction | null) ?? "KEEP")
              }
              items={{
                KEEP: t("filterRuleReadKeepOption"),
                READ: t("filterRuleReadOption"),
                UNREAD: t("filterRuleUnreadOption"),
              }}
              disabled={submitting}
            >
              <SelectTrigger
                className="w-full"
                aria-label={t("filterRuleReadActionLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="KEEP">
                    {t("filterRuleReadKeepOption")}
                  </SelectItem>
                  <SelectItem value="READ">
                    {t("filterRuleReadOption")}
                  </SelectItem>
                  <SelectItem value="UNREAD">
                    {t("filterRuleUnreadOption")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {t("filterRuleReadActionDescription")}
            </FieldDescription>
          </Field>

          <Field data-invalid={foldersError}>
            <FieldLabel>{t("filterRuleMoveActionLabel")}</FieldLabel>
            {foldersError ? (
              <div className="space-y-2">
                <FieldError>{t("errorLoadFolders")}</FieldError>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => {
                    setFolders(null);
                    setFoldersError(false);
                    setFoldersReload((value) => value + 1);
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
            ) : folders === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-label={t("loadingFoldersLabel")} />
                {t("loadingFoldersLabel")}
              </div>
            ) : (
              <Select
                value={moveToFolderId}
                onValueChange={(value) =>
                  setMoveToFolderId(value ?? KEEP_FOLDER_VALUE)
                }
                items={folderItems}
                disabled={submitting}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("filterRuleMoveActionLabel")}
                  aria-invalid={Boolean(fieldErrors.moveToFolderId)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(folderItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <FieldDescription>
              {t("filterRuleMoveActionDescription")}
            </FieldDescription>
            <FieldError>{fieldErrors.moveToFolderId}</FieldError>
          </Field>

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
  /** Present when the dialog was opened from the AI suggestion button. */
  proposal?: MailAiFilterProposalDto | null;
  onSaved: (result: FilterRuleSaveResult) => void;
}

export function FilterRuleDialog({
  open,
  onOpenChange,
  detail,
  accountName,
  proposal,
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
          // Remounted per proposal so a suggestion that arrives while the
          // dialog is already open replaces the pre-filled state instead of
          // being ignored by the useState initializers.
          key={proposal ? `proposal-${proposal.name}` : "manual"}
          accountId={detail.accountId}
          accountName={accountName}
          defaultFromAddress={detail.from}
          proposal={proposal ?? undefined}
          onSaved={onSaved}
          onCancel={() => onOpenChange(false)}
          onSubmittingChange={setSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
