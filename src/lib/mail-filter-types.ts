export const MAIL_FILTER_MATCH_MODES = ["ALL", "ANY"] as const;
export type MailFilterMatchMode = (typeof MAIL_FILTER_MATCH_MODES)[number];

export const MAIL_FILTER_CONDITION_FIELDS = [
  "FROM_ADDRESS",
  "FROM_DOMAIN",
  "RECIPIENT",
  "SUBJECT",
  "BODY",
  "HAS_ATTACHMENT",
] as const;
export type MailFilterConditionField =
  (typeof MAIL_FILTER_CONDITION_FIELDS)[number];

export const MAIL_FILTER_CONDITION_OPERATORS = [
  "EQUALS",
  "CONTAINS",
  "IS",
] as const;
export type MailFilterConditionOperator =
  (typeof MAIL_FILTER_CONDITION_OPERATORS)[number];

export const MAX_MAIL_FILTER_CONDITIONS = 10;
export const MAX_MAIL_FILTER_CONDITION_VALUE_LENGTH = 500;

export interface MailFilterConditionInput {
  field: MailFilterConditionField;
  operator: MailFilterConditionOperator;
  value: string;
  isNegated: boolean;
}

export interface MailFilterConditionDto extends MailFilterConditionInput {
  id: string;
  position: number;
}

const OPERATORS_BY_FIELD: Record<
  MailFilterConditionField,
  readonly MailFilterConditionOperator[]
> = {
  FROM_ADDRESS: ["EQUALS", "CONTAINS"],
  FROM_DOMAIN: ["EQUALS"],
  RECIPIENT: ["CONTAINS", "EQUALS"],
  SUBJECT: ["CONTAINS", "EQUALS"],
  BODY: ["CONTAINS"],
  HAS_ATTACHMENT: ["IS"],
};

export function mailFilterOperatorsForField(
  field: MailFilterConditionField,
): readonly MailFilterConditionOperator[] {
  return OPERATORS_BY_FIELD[field];
}

export function isMailFilterConditionCombinationValid(
  field: MailFilterConditionField,
  operator: MailFilterConditionOperator,
): boolean {
  return mailFilterOperatorsForField(field).includes(operator);
}

export function defaultMailFilterOperator(
  field: MailFilterConditionField,
): MailFilterConditionOperator {
  return mailFilterOperatorsForField(field)[0];
}
