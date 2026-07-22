export interface MailFilterCandidate {
  fromAddress: string;
  subject: string;
}

export interface MailFilterCriteria {
  fromAddress?: string | null;
  subjectContains?: string | null;
}

export interface LabeledMailFilterCriteria extends MailFilterCriteria {
  labelId: string;
}

export function normalizeMailMatchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function matchesMailFilter(
  rule: MailFilterCriteria,
  candidate: MailFilterCandidate,
): boolean {
  const fromAddress = normalizeMailMatchText(rule.fromAddress ?? "");
  const subjectContains = normalizeMailMatchText(rule.subjectContains ?? "");
  if (!fromAddress && !subjectContains) return false;

  return (
    (!fromAddress ||
      fromAddress === normalizeMailMatchText(candidate.fromAddress)) &&
    (!subjectContains ||
      normalizeMailMatchText(candidate.subject).includes(subjectContains))
  );
}

/** Shared future/live and batch-style evaluator; preserves first-match order. */
export function matchingMailFilterLabelIds(
  rules: readonly LabeledMailFilterCriteria[],
  candidate: MailFilterCandidate,
): string[] {
  return [
    ...new Set(
      rules
        .filter((rule) => matchesMailFilter(rule, candidate))
        .map((rule) => rule.labelId),
    ),
  ];
}

/** Phase-2 compatibility wrapper. New code should use matchesMailFilter. */
export function matchesExactSenderMailFilter(
  rule: { fromAddress: string },
  candidate: Pick<MailFilterCandidate, "fromAddress">,
): boolean {
  return matchesMailFilter(rule, {
    fromAddress: candidate.fromAddress,
    subject: "",
  });
}
