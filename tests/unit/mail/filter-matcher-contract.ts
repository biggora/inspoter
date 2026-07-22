import type {
  MailFilterCandidate,
  MailFilterCriteria,
} from "@/lib/mail-filter-matcher";

export interface MailFilterMatchContractCase {
  id: string;
  rule: MailFilterCriteria;
  candidate: MailFilterCandidate;
  expected: boolean;
}

export const MAIL_FILTER_MATCH_CONTRACT_CASES = [
  {
    id: "sender-only-nfkc-case-whitespace-positive",
    rule: {
      fromAddress: "  Ａlice.contract@example.com  ",
      subjectContains: " ",
    },
    candidate: {
      fromAddress: "alice.contract@EXAMPLE.COM",
      subject: "Sender-only positive",
    },
    expected: true,
  },
  {
    id: "sender-only-exact-negative",
    rule: {
      fromAddress: "exact.contract@example.com",
      subjectContains: null,
    },
    candidate: {
      fromAddress: "prefix-exact.contract@example.com",
      subject: "Sender-only negative",
    },
    expected: false,
  },
  {
    id: "subject-only-nfkc-case-whitespace-positive",
    rule: { fromAddress: " ", subjectContains: "  ＡLERT-CONTRACT  " },
    candidate: {
      fromAddress: "subject-positive@example.com",
      subject: "Build alert-contract received",
    },
    expected: true,
  },
  {
    id: "subject-only-substring-negative",
    rule: { fromAddress: null, subjectContains: "needle-contract" },
    candidate: {
      fromAddress: "subject-negative@example.com",
      subject: "Haystack contract only",
    },
    expected: false,
  },
  {
    id: "and-positive",
    rule: {
      fromAddress: "  Ops.Contract@Example.com ",
      subjectContains: " INCIDENT-CONTRACT ",
    },
    candidate: {
      fromAddress: "ops.contract@example.COM",
      subject: "Production incident-contract detected",
    },
    expected: true,
  },
  {
    id: "and-sender-negative",
    rule: {
      fromAddress: "ops-sender.contract@example.com",
      subjectContains: "incident-sender-contract",
    },
    candidate: {
      fromAddress: "other-sender.contract@example.com",
      subject: "Production incident-sender-contract detected",
    },
    expected: false,
  },
  {
    id: "and-subject-negative",
    rule: {
      fromAddress: "ops-subject.contract@example.com",
      subjectContains: "incident-subject-contract",
    },
    candidate: {
      fromAddress: "ops-subject.contract@example.com",
      subject: "Production healthy subject contract",
    },
    expected: false,
  },
] as const satisfies readonly MailFilterMatchContractCase[];
