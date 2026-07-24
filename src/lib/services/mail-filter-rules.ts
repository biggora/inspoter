import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  runMailAccountTransaction,
  type MailAccountTransactionRunner,
} from "@/lib/services/mail-locks";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";
import {
  createMailFilterRunInTransaction,
  MAIL_FILTER_RUN_DTO_SELECT,
  toMailFilterRunDto,
  type MailFilterRunDtoRow,
} from "@/lib/services/mail-filter-runs";

export const ACTIVE_MAIL_FILTER_RULE_LIMIT = 100;

export class MailFilterRuleResourceNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "MailFilterRuleResourceNotFoundError";
  }
}

export class ActiveMailFilterRuleLimitReachedError extends Error {
  readonly code = "ACTIVE_RULE_LIMIT_REACHED";

  constructor() {
    super("Active filter rule limit reached.");
    this.name = "ActiveMailFilterRuleLimitReachedError";
  }
}

export class MailFilterRulePredicateRequiredError extends Error {
  readonly code = "RULE_PREDICATE_REQUIRED";

  constructor() {
    super("At least one filter predicate is required.");
    this.name = "MailFilterRulePredicateRequiredError";
  }
}

export interface CreateMailFilterRuleInput {
  accountId: string;
  labelId: string;
  name: string;
  fromAddress?: string | null;
  subjectContains?: string | null;
  applyToExistingMail?: boolean;
}

export interface UpdateMailFilterRuleInput {
  labelId?: string;
  name?: string;
  fromAddress?: string | null;
  subjectContains?: string | null;
  isActive?: boolean;
  position?: number;
}

const RULE_SELECT = {
  id: true,
  accountId: true,
  labelId: true,
  name: true,
  fromAddress: true,
  subjectContains: true,
  isActive: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  label: { select: { name: true, color: true } },
  filterRuns: {
    select: MAIL_FILTER_RUN_DTO_SELECT,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
} satisfies Prisma.MailFilterRuleSelect;

function withLatestRun<
  T extends { filterRuns: readonly MailFilterRunDtoRow[] },
>(rule: T) {
  const { filterRuns, ...rest } = rule;
  return {
    ...rest,
    latestRun: filterRuns[0] ? toMailFilterRunDto(filterRuns[0]) : null,
  };
}

function normalizeCriterion(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.normalize("NFKC").trim() || null;
}

function requirePredicate(
  fromAddress: string | null,
  subjectContains: string | null,
): void {
  if (!fromAddress && !subjectContains) {
    throw new MailFilterRulePredicateRequiredError();
  }
}

async function requireRuleInWorkspace(workspaceId: string, id: string) {
  const rule = await db.mailFilterRule.findFirst({
    where: { id, workspaceId },
    select: { id: true, accountId: true },
  });
  if (!rule) throw new MailFilterRuleResourceNotFoundError();
  return rule;
}

function mapKnownMutationError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003" || error.code === "P2025") {
      throw new MailFilterRuleResourceNotFoundError();
    }
  }
  throw error;
}

export async function listMailFilterRules(
  workspaceId: string,
  operatorId: string,
  accountId: string,
) {
  const account = await db.mailAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true },
  });
  if (!account) throw new MailFilterRuleResourceNotFoundError();
  await requireWorkspaceMember(workspaceId, operatorId);

  const rules = await db.mailFilterRule.findMany({
    where: { workspaceId, accountId },
    select: RULE_SELECT,
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  return rules.map(withLatestRun);
}

export const listExactSenderRules = listMailFilterRules;

export async function createMailFilterRule(
  workspaceId: string,
  operatorId: string,
  input: CreateMailFilterRuleInput,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
) {
  const fromAddress = normalizeCriterion(input.fromAddress);
  const subjectContains = normalizeCriterion(input.subjectContains);
  requirePredicate(fromAddress, subjectContains);

  const [account, label] = await Promise.all([
    db.mailAccount.findFirst({
      where: { id: input.accountId, workspaceId },
      select: { id: true },
    }),
    db.mailLabel.findFirst({
      where: { id: input.labelId, workspaceId },
      select: { id: true },
    }),
  ]);
  if (!account || !label) throw new MailFilterRuleResourceNotFoundError();
  await requireWorkspaceMember(workspaceId, operatorId);

  try {
    return await runAccountTransaction(input.accountId, async (tx) => {
      const [lockedAccount, lockedLabel] = await Promise.all([
        tx.mailAccount.findFirst({
          where: { id: input.accountId, workspaceId },
          select: { id: true },
        }),
        tx.mailLabel.findFirst({
          where: { id: input.labelId, workspaceId },
          select: { id: true },
        }),
      ]);
      if (!lockedAccount || !lockedLabel) {
        throw new MailFilterRuleResourceNotFoundError();
      }

      const activeCount = await tx.mailFilterRule.count({
        where: { workspaceId, accountId: input.accountId, isActive: true },
      });
      if (activeCount >= ACTIVE_MAIL_FILTER_RULE_LIMIT) {
        throw new ActiveMailFilterRuleLimitReachedError();
      }

      const last = await tx.mailFilterRule.aggregate({
        where: { workspaceId, accountId: input.accountId },
        _max: { position: true },
      });
      const created = await tx.mailFilterRule.create({
        data: {
          workspaceId,
          accountId: input.accountId,
          accountWorkspaceId: workspaceId,
          labelId: input.labelId,
          labelWorkspaceId: workspaceId,
          name: input.name,
          fromAddress,
          subjectContains,
          position: (last._max.position ?? -1) + 1,
        },
        select: RULE_SELECT,
      });
      let latestRun = created.filterRuns[0]
        ? toMailFilterRunDto(created.filterRuns[0])
        : null;
      if (input.applyToExistingMail) {
        latestRun = await createMailFilterRunInTransaction(tx, workspaceId, {
          id: created.id,
          accountId: created.accountId,
          labelId: created.labelId,
          fromAddress: created.fromAddress,
          subjectContains: created.subjectContains,
        });
      }
      return { ...withLatestRun(created), latestRun };
    });
  } catch (error) {
    mapKnownMutationError(error);
  }
}

export const createExactSenderRule = createMailFilterRule;

export async function updateMailFilterRule(
  workspaceId: string,
  operatorId: string,
  id: string,
  input: UpdateMailFilterRuleInput,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
) {
  const scopedRule = await requireRuleInWorkspace(workspaceId, id);
  await requireWorkspaceMember(workspaceId, operatorId);

  try {
    return await runAccountTransaction(scopedRule.accountId, async (tx) => {
      const current = await tx.mailFilterRule.findFirst({
        where: { id, workspaceId, accountId: scopedRule.accountId },
        select: {
          id: true,
          labelId: true,
          fromAddress: true,
          subjectContains: true,
          isActive: true,
        },
      });
      if (!current) throw new MailFilterRuleResourceNotFoundError();

      if (input.labelId !== undefined && input.labelId !== current.labelId) {
        const label = await tx.mailLabel.findFirst({
          where: { id: input.labelId, workspaceId },
          select: { id: true },
        });
        if (!label) throw new MailFilterRuleResourceNotFoundError();
      }

      const fromAddress = Object.hasOwn(input, "fromAddress")
        ? normalizeCriterion(input.fromAddress)
        : current.fromAddress;
      const subjectContains = Object.hasOwn(input, "subjectContains")
        ? normalizeCriterion(input.subjectContains)
        : current.subjectContains;
      requirePredicate(fromAddress, subjectContains);

      if (!current.isActive && input.isActive === true) {
        const activeCount = await tx.mailFilterRule.count({
          where: {
            workspaceId,
            accountId: scopedRule.accountId,
            isActive: true,
          },
        });
        if (activeCount >= ACTIVE_MAIL_FILTER_RULE_LIMIT) {
          throw new ActiveMailFilterRuleLimitReachedError();
        }
      }

      let position: number | undefined;
      if (input.position !== undefined) {
        const rules = await tx.mailFilterRule.findMany({
          where: { workspaceId, accountId: scopedRule.accountId },
          select: { id: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        });
        const orderedIds = rules
          .filter((rule) => rule.id !== id)
          .map((rule) => rule.id);
        position = Math.min(input.position, orderedIds.length);
        orderedIds.splice(position, 0, id);
        await Promise.all(
          orderedIds.map((ruleId, index) =>
            tx.mailFilterRule.update({
              where: { id_workspaceId: { id: ruleId, workspaceId } },
              data: { position: index },
            }),
          ),
        );
      }

      const updated = await tx.mailFilterRule.update({
        where: { id_workspaceId: { id, workspaceId } },
        data: {
          ...(input.labelId !== undefined ? { labelId: input.labelId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          fromAddress,
          subjectContains,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(position !== undefined ? { position } : {}),
        },
        select: RULE_SELECT,
      });
      return withLatestRun(updated);
    });
  } catch (error) {
    mapKnownMutationError(error);
  }
}

export async function deleteMailFilterRule(
  workspaceId: string,
  operatorId: string,
  id: string,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
): Promise<void> {
  const scopedRule = await requireRuleInWorkspace(workspaceId, id);
  await requireWorkspaceMember(workspaceId, operatorId);

  try {
    await runAccountTransaction(scopedRule.accountId, async (tx) => {
      const rule = await tx.mailFilterRule.findFirst({
        where: { id, workspaceId, accountId: scopedRule.accountId },
        select: { id: true },
      });
      if (!rule) throw new MailFilterRuleResourceNotFoundError();

      await tx.mailFilterRule.delete({
        where: { id_workspaceId: { id, workspaceId } },
      });
      const remaining = await tx.mailFilterRule.findMany({
        where: { workspaceId, accountId: scopedRule.accountId },
        select: { id: true, position: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
      await Promise.all(
        remaining.map((remainingRule, position) =>
          remainingRule.position === position
            ? Promise.resolve()
            : tx.mailFilterRule.update({
                where: {
                  id_workspaceId: { id: remainingRule.id, workspaceId },
                },
                data: { position },
              }),
        ),
      );
    });
  } catch (error) {
    mapKnownMutationError(error);
  }
}
