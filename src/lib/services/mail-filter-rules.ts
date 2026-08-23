import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  isMailFilterConditionCombinationValid,
  MAX_MAIL_FILTER_CONDITIONS,
  type MailFilterConditionInput,
  type MailFilterMatchMode,
} from "@/lib/mail-filter-types";
import { legacyCriteriaToMailFilterConditions } from "@/lib/mail-filter-matcher";
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
  matchMode?: MailFilterMatchMode;
  conditions?: readonly MailFilterConditionInput[];
  fromAddress?: string | null;
  subjectContains?: string | null;
  setRead?: boolean | null;
  moveToFolderId?: string | null;
  applyToExistingMail?: boolean;
}

export interface UpdateMailFilterRuleInput {
  labelId?: string;
  name?: string;
  matchMode?: MailFilterMatchMode;
  conditions?: readonly MailFilterConditionInput[];
  fromAddress?: string | null;
  subjectContains?: string | null;
  setRead?: boolean | null;
  moveToFolderId?: string | null;
  isActive?: boolean;
  position?: number;
}

// An API token has no operator behind it, so its own workspace scope is the
// authority and the membership check is skipped — same contract as
// src/lib/services/contacts.ts.
async function requireWriteAccess(
  workspaceId: string,
  operatorId: string | null,
): Promise<void> {
  if (operatorId !== null)
    await requireWorkspaceMember(workspaceId, operatorId);
}

const RULE_SELECT = {
  id: true,
  accountId: true,
  labelId: true,
  name: true,
  fromAddress: true,
  subjectContains: true,
  matchMode: true,
  setRead: true,
  moveToFolderId: true,
  conditions: {
    select: {
      id: true,
      field: true,
      operator: true,
      value: true,
      isNegated: true,
      position: true,
    },
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
  },
  isActive: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  label: { select: { name: true, color: true } },
  moveToFolder: { select: { name: true } },
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
  conditions: readonly MailFilterConditionInput[],
): void {
  if (conditions.length === 0) {
    throw new MailFilterRulePredicateRequiredError();
  }
}

function normalizeConditions(
  input: readonly MailFilterConditionInput[],
): MailFilterConditionInput[] {
  if (
    input.length === 0 ||
    input.length > MAX_MAIL_FILTER_CONDITIONS ||
    input.some(
      (condition) =>
        !isMailFilterConditionCombinationValid(
          condition.field,
          condition.operator,
        ) || !condition.value.normalize("NFKC").trim(),
    )
  ) {
    throw new MailFilterRulePredicateRequiredError();
  }
  return input.map((condition) => ({
    ...condition,
    value: condition.value.normalize("NFKC").trim(),
  }));
}

function conditionsFromInput(input: {
  conditions?: readonly MailFilterConditionInput[];
  fromAddress?: string | null;
  subjectContains?: string | null;
}): MailFilterConditionInput[] {
  if (input.conditions !== undefined) {
    return normalizeConditions(input.conditions);
  }
  return legacyCriteriaToMailFilterConditions({
    fromAddress: normalizeCriterion(input.fromAddress),
    subjectContains: normalizeCriterion(input.subjectContains),
  });
}

function legacyColumnsFromConditions(
  conditions: readonly MailFilterConditionInput[],
): { fromAddress: string | null; subjectContains: string | null } {
  const fromAddress =
    conditions.find(
      (condition) =>
        condition.field === "FROM_ADDRESS" &&
        condition.operator === "EQUALS" &&
        !condition.isNegated,
    )?.value ?? null;
  const subjectContains =
    conditions.find(
      (condition) =>
        condition.field === "SUBJECT" &&
        condition.operator === "CONTAINS" &&
        !condition.isNegated,
    )?.value ?? null;
  return { fromAddress, subjectContains };
}

function conditionCreateData(
  workspaceId: string,
  conditions: readonly MailFilterConditionInput[],
) {
  return conditions.map((condition, position) => ({
    workspaceId,
    field: condition.field,
    operator: condition.operator,
    value: condition.value,
    isNegated: condition.isNegated,
    position,
  }));
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
  operatorId: string | null,
  accountId: string,
) {
  const account = await db.mailAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true },
  });
  if (!account) throw new MailFilterRuleResourceNotFoundError();
  await requireWriteAccess(workspaceId, operatorId);

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
  operatorId: string | null,
  input: CreateMailFilterRuleInput,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
) {
  const conditions = conditionsFromInput(input);
  requirePredicate(conditions);
  const { fromAddress, subjectContains } =
    legacyColumnsFromConditions(conditions);
  const matchMode = input.matchMode ?? "ALL";

  const [account, label, moveTarget] = await Promise.all([
    db.mailAccount.findFirst({
      where: { id: input.accountId, workspaceId },
      select: { id: true },
    }),
    db.mailLabel.findFirst({
      where: { id: input.labelId, workspaceId },
      select: { id: true },
    }),
    input.moveToFolderId
      ? db.mailFolder.findFirst({
          where: {
            id: input.moveToFolderId,
            workspaceId,
            accountId: input.accountId,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (
    !account ||
    !label ||
    (input.moveToFolderId !== undefined &&
      input.moveToFolderId !== null &&
      !moveTarget)
  ) {
    throw new MailFilterRuleResourceNotFoundError();
  }
  await requireWriteAccess(workspaceId, operatorId);

  try {
    return await runAccountTransaction(input.accountId, async (tx) => {
      const [lockedAccount, lockedLabel, lockedMoveTarget] = await Promise.all([
        tx.mailAccount.findFirst({
          where: { id: input.accountId, workspaceId },
          select: { id: true },
        }),
        tx.mailLabel.findFirst({
          where: { id: input.labelId, workspaceId },
          select: { id: true },
        }),
        input.moveToFolderId
          ? tx.mailFolder.findFirst({
              where: {
                id: input.moveToFolderId,
                workspaceId,
                accountId: input.accountId,
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (
        !lockedAccount ||
        !lockedLabel ||
        (input.moveToFolderId !== undefined &&
          input.moveToFolderId !== null &&
          !lockedMoveTarget)
      ) {
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
          matchMode,
          setRead: input.setRead,
          moveToFolderId: input.moveToFolderId,
          moveToFolderWorkspaceId: input.moveToFolderId ? workspaceId : null,
          position: (last._max.position ?? -1) + 1,
          conditions: {
            create: conditionCreateData(workspaceId, conditions),
          },
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
          matchMode: created.matchMode,
          conditions: created.conditions,
          setRead: created.setRead,
          moveToFolderId: created.moveToFolderId,
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
  operatorId: string | null,
  id: string,
  input: UpdateMailFilterRuleInput,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
) {
  const scopedRule = await requireRuleInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);

  try {
    return await runAccountTransaction(scopedRule.accountId, async (tx) => {
      const current = await tx.mailFilterRule.findFirst({
        where: { id, workspaceId, accountId: scopedRule.accountId },
        select: {
          id: true,
          labelId: true,
          fromAddress: true,
          subjectContains: true,
          matchMode: true,
          setRead: true,
          moveToFolderId: true,
          conditions: {
            select: {
              field: true,
              operator: true,
              value: true,
              isNegated: true,
            },
            orderBy: [{ position: "asc" }, { id: "asc" }],
          },
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

      if (
        input.moveToFolderId !== undefined &&
        input.moveToFolderId !== null &&
        input.moveToFolderId !== current.moveToFolderId
      ) {
        const target = await tx.mailFolder.findFirst({
          where: {
            id: input.moveToFolderId,
            workspaceId,
            accountId: scopedRule.accountId,
          },
          select: { id: true },
        });
        if (!target) throw new MailFilterRuleResourceNotFoundError();
      }

      const legacyConditionsChanged =
        Object.hasOwn(input, "fromAddress") ||
        Object.hasOwn(input, "subjectContains");
      const conditionsChanged =
        input.conditions !== undefined || legacyConditionsChanged;
      const conditions = input.conditions
        ? normalizeConditions(input.conditions)
        : legacyConditionsChanged
          ? conditionsFromInput({
              fromAddress: Object.hasOwn(input, "fromAddress")
                ? input.fromAddress
                : current.fromAddress,
              subjectContains: Object.hasOwn(input, "subjectContains")
                ? input.subjectContains
                : current.subjectContains,
            })
          : current.conditions.length > 0
            ? current.conditions
            : conditionsFromInput({
                fromAddress: current.fromAddress,
                subjectContains: current.subjectContains,
              });
      requirePredicate(conditions);
      const legacyColumns = conditionsChanged
        ? legacyColumnsFromConditions(conditions)
        : {
            fromAddress: current.fromAddress,
            subjectContains: current.subjectContains,
          };

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
          fromAddress: legacyColumns.fromAddress,
          subjectContains: legacyColumns.subjectContains,
          ...(input.matchMode !== undefined
            ? { matchMode: input.matchMode }
            : {}),
          ...(input.setRead !== undefined ? { setRead: input.setRead } : {}),
          ...(input.moveToFolderId !== undefined
            ? {
                moveToFolderId: input.moveToFolderId,
                moveToFolderWorkspaceId: input.moveToFolderId
                  ? workspaceId
                  : null,
              }
            : {}),
          ...(conditionsChanged
            ? {
                conditions: {
                  deleteMany: {},
                  create: conditionCreateData(workspaceId, conditions),
                },
              }
            : {}),
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
  operatorId: string | null,
  id: string,
  runAccountTransaction: MailAccountTransactionRunner = runMailAccountTransaction,
): Promise<void> {
  const scopedRule = await requireRuleInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);

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
