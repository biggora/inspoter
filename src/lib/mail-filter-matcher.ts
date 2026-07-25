import {
  MAIL_FILTER_CONDITION_FIELDS,
  MAIL_FILTER_CONDITION_OPERATORS,
  isMailFilterConditionCombinationValid,
  type MailFilterConditionInput,
  type MailFilterMatchMode,
} from "@/lib/mail-filter-types";

export interface MailFilterCandidate {
  fromAddress: string;
  subject: string;
  toRecipients?: unknown;
  ccRecipients?: unknown;
  bccRecipients?: unknown;
  bodyText?: string;
  hasAttachments?: boolean;
}

export interface LegacyMailFilterCriteria {
  fromAddress?: string | null;
  subjectContains?: string | null;
}

export interface MailFilterCriteria extends LegacyMailFilterCriteria {
  matchMode?: MailFilterMatchMode;
  conditions?: readonly MailFilterConditionInput[];
}

export interface LabeledMailFilterCriteria extends MailFilterCriteria {
  labelId: string;
}

export function normalizeMailMatchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function extractRecipientAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (
      typeof entry === "object" &&
      entry !== null &&
      "address" in entry &&
      typeof entry.address === "string"
    ) {
      return [entry.address];
    }
    return [];
  });
}

function senderDomain(address: string): string {
  const normalized = normalizeMailMatchText(address);
  const separator = normalized.lastIndexOf("@");
  return separator === -1 ? "" : normalized.slice(separator + 1);
}

function matchesText(
  candidate: string,
  operator: MailFilterConditionInput["operator"],
  value: string,
): boolean {
  const normalizedCandidate = normalizeMailMatchText(candidate);
  const normalizedValue = normalizeMailMatchText(value);
  if (operator === "EQUALS") return normalizedCandidate === normalizedValue;
  if (operator === "CONTAINS") {
    return normalizedCandidate.includes(normalizedValue);
  }
  return false;
}

function matchesCondition(
  condition: MailFilterConditionInput,
  candidate: MailFilterCandidate,
): boolean {
  let matched = false;

  switch (condition.field) {
    case "FROM_ADDRESS":
      matched = matchesText(
        candidate.fromAddress,
        condition.operator,
        condition.value,
      );
      break;
    case "FROM_DOMAIN":
      matched = matchesText(
        senderDomain(candidate.fromAddress),
        condition.operator,
        condition.value.replace(/^@/u, ""),
      );
      break;
    case "RECIPIENT": {
      const addresses = [
        ...extractRecipientAddresses(candidate.toRecipients),
        ...extractRecipientAddresses(candidate.ccRecipients),
        ...extractRecipientAddresses(candidate.bccRecipients),
      ];
      matched = addresses.some((address) =>
        matchesText(address, condition.operator, condition.value),
      );
      break;
    }
    case "SUBJECT":
      matched = matchesText(
        candidate.subject,
        condition.operator,
        condition.value,
      );
      break;
    case "BODY":
      matched = matchesText(
        candidate.bodyText ?? "",
        condition.operator,
        condition.value,
      );
      break;
    case "HAS_ATTACHMENT":
      matched =
        (candidate.hasAttachments ?? false) ===
        (normalizeMailMatchText(condition.value) === "true");
      break;
  }

  return condition.isNegated ? !matched : matched;
}

export function legacyCriteriaToMailFilterConditions(
  rule: LegacyMailFilterCriteria,
): MailFilterConditionInput[] {
  const conditions: MailFilterConditionInput[] = [];
  const fromAddress = rule.fromAddress?.normalize("NFKC").trim();
  const subjectContains = rule.subjectContains?.normalize("NFKC").trim();

  if (fromAddress) {
    conditions.push({
      field: "FROM_ADDRESS",
      operator: "EQUALS",
      value: fromAddress,
      isNegated: false,
    });
  }
  if (subjectContains) {
    conditions.push({
      field: "SUBJECT",
      operator: "CONTAINS",
      value: subjectContains,
      isNegated: false,
    });
  }
  return conditions;
}

export function mailFilterConditionsForCriteria(
  rule: MailFilterCriteria,
): readonly MailFilterConditionInput[] {
  return rule.conditions && rule.conditions.length > 0
    ? rule.conditions
    : legacyCriteriaToMailFilterConditions(rule);
}

export function matchesMailFilterRule(
  rule: MailFilterCriteria,
  candidate: MailFilterCandidate,
): boolean {
  const conditions = mailFilterConditionsForCriteria(rule);
  if (conditions.length === 0) return false;
  const matchMode = rule.matchMode ?? "ALL";
  return matchMode === "ANY"
    ? conditions.some((condition) => matchesCondition(condition, candidate))
    : conditions.every((condition) => matchesCondition(condition, candidate));
}

export function matchesMailFilter(
  rule: LegacyMailFilterCriteria,
  candidate: MailFilterCandidate,
): boolean {
  return matchesMailFilterRule(rule, candidate);
}

/** Shared future/live and batch-style evaluator; preserves rule order. */
export function matchingMailFilterLabelIds(
  rules: readonly LabeledMailFilterCriteria[],
  candidate: MailFilterCandidate,
): string[] {
  return [
    ...new Set(
      rules
        .filter((rule) => matchesMailFilterRule(rule, candidate))
        .map((rule) => rule.labelId),
    ),
  ];
}

export function parseMailFilterConditionSnapshot(
  value: unknown,
): MailFilterConditionInput[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.field !== "string" ||
      !MAIL_FILTER_CONDITION_FIELDS.some(
        (field) => field === candidate.field,
      ) ||
      typeof candidate.operator !== "string" ||
      !MAIL_FILTER_CONDITION_OPERATORS.some(
        (operator) => operator === candidate.operator,
      ) ||
      typeof candidate.value !== "string" ||
      typeof candidate.isNegated !== "boolean"
    ) {
      return [];
    }
    const condition = {
      field: candidate.field,
      operator: candidate.operator,
      value: candidate.value,
      isNegated: candidate.isNegated,
    } as MailFilterConditionInput;
    return isMailFilterConditionCombinationValid(
      condition.field,
      condition.operator,
    )
      ? [condition]
      : [];
  });
}

export function parseMailFilterMatchMode(value: unknown): MailFilterMatchMode {
  return value === "ALL" || value === "ANY" ? value : "ALL";
}

/** Phase-2 compatibility wrapper. New code should use matchesMailFilterRule. */
export function matchesExactSenderMailFilter(
  rule: { fromAddress: string },
  candidate: Pick<MailFilterCandidate, "fromAddress">,
): boolean {
  return matchesMailFilter(rule, {
    fromAddress: candidate.fromAddress,
    subject: "",
  });
}
