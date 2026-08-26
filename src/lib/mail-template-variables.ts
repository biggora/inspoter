export const MAIL_TEMPLATE_VARIABLE_LIMIT = 20;
export const MAIL_TEMPLATE_VARIABLE_NAME_MAX = 50;

const VARIABLE_PATTERN = /\{\{([^{}]*)\}\}/gu;
const VARIABLE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}_ -]{0,49}$/u;

export class MailTemplateVariableError extends Error {
  readonly code:
    "INVALID_VARIABLE_NAME" | "TOO_MANY_VARIABLES" | "MISSING_VARIABLE_VALUE";

  constructor(
    code:
      "INVALID_VARIABLE_NAME" | "TOO_MANY_VARIABLES" | "MISSING_VARIABLE_VALUE",
    message: string,
  ) {
    super(message);
    this.name = "MailTemplateVariableError";
    this.code = code;
  }
}

function normalizeVariableName(name: string): string {
  return name.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function extractMailTemplateVariables(
  ...values: readonly string[]
): string[] {
  const variables = new Map<string, string>();
  for (const value of values) {
    for (const match of value.matchAll(VARIABLE_PATTERN)) {
      const displayName = match[1].trim().replace(/\s+/gu, " ");
      if (!VARIABLE_NAME_PATTERN.test(displayName)) {
        throw new MailTemplateVariableError(
          "INVALID_VARIABLE_NAME",
          `Template variable names must be between 1 and ${MAIL_TEMPLATE_VARIABLE_NAME_MAX} characters.`,
        );
      }
      const normalizedName = normalizeVariableName(displayName);
      if (!variables.has(normalizedName)) {
        variables.set(normalizedName, displayName);
      }
    }
  }
  const result = [...variables.values()];
  if (result.length > MAIL_TEMPLATE_VARIABLE_LIMIT) {
    throw new MailTemplateVariableError(
      "TOO_MANY_VARIABLES",
      `A template can contain at most ${MAIL_TEMPLATE_VARIABLE_LIMIT} variables.`,
    );
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function substitute(
  source: string,
  values: Readonly<Record<string, string>>,
  html: boolean,
): string {
  return source.replace(VARIABLE_PATTERN, (_token, rawName: string) => {
    const name = normalizeVariableName(rawName);
    const value = Object.entries(values).find(
      ([key]) => normalizeVariableName(key) === name,
    )?.[1];
    if (value === undefined || value.trim().length === 0) {
      throw new MailTemplateVariableError(
        "MISSING_VARIABLE_VALUE",
        `A value is required for ${rawName.trim()}.`,
      );
    }
    return html ? escapeHtml(value) : value;
  });
}

export interface AppliedMailTemplate {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export function applyMailTemplateVariables(
  template: AppliedMailTemplate,
  values: Readonly<Record<string, string>>,
): AppliedMailTemplate {
  return {
    subject: substitute(template.subject, values, false),
    bodyText: substitute(template.bodyText, values, false),
    bodyHtml: substitute(template.bodyHtml, values, true),
  };
}
