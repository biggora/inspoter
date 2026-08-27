import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  approveAndExecuteDecision,
  createManualDecision,
  executeDecisionAction,
  getDecision,
  listManagementKanbanTargets,
  transitionDecision,
  updateDecision,
} from "@/lib/services/management";
import { createBoard, getBoard } from "@/lib/services/kanban";
import {
  buildExecutiveSnapshot,
  EXECUTIVE_SNAPSHOT_MAX_BYTES,
} from "@/lib/management/snapshot";
import {
  ensureExecutiveBriefSetup,
  EXECUTIVE_BRIEF_AGENT_KEY,
  EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY,
  EXECUTIVE_BRIEF_SKILL_KEY,
  captureExecutiveBriefSnapshotForRun,
  createScheduledExecutiveBriefGeneration,
  generateExecutiveBriefNow,
  getExecutiveBriefSetupStatus,
  publishExecutiveBriefForRun,
} from "@/lib/services/executive-briefs";

let workspaceId: string;
let otherWorkspaceId: string;

const actor = {
  kind: "HUMAN" as const,
  id: "management-integration-operator",
  name: "Management integration operator",
};

beforeAll(async () => {
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: {
        name: "Management integration",
        slug: `management-${randomUUID()}`,
      },
    }),
    db.workspace.create({
      data: {
        name: "Management isolation",
        slug: `management-other-${randomUUID()}`,
      },
    }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;
  await db.workspaceEmbeddingProfile.create({
    data: {
      workspaceId,
      model: "test-embedding",
      dimensions: 3,
      revision: 1,
    },
  });
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  await db.executiveBriefGeneration.deleteMany({ where: { workspaceId } });
  await db.agentSchedule.deleteMany({ where: { workspaceId } });
  await db.agentSkill.deleteMany({ where: { workspaceId } });
  await db.agent.deleteMany({ where: { workspaceId } });
  await db.skill.deleteMany({ where: { workspaceId } });
  await db.providerCredential.deleteMany({ where: { workspaceId } });
  await db.decision.deleteMany({ where: { workspaceId } });
  await db.note.deleteMany({ where: { workspaceId } });
  await db.kanbanBoard.deleteMany({ where: { workspaceId } });
  await db.reminder.deleteMany({ where: { workspaceId } });
  await db.mailAccount.deleteMany({ where: { workspaceId } });
});

async function createBriefRunFixture() {
  const { agent } = await ensureExecutiveBriefSetup(workspaceId);
  const leaseToken = randomUUID();
  const run = await db.agentRun.create({
    data: {
      workspaceId,
      agentId: agent.id,
      agentWorkspaceId: workspaceId,
      sourceAgentId: agent.id,
      snapshotAgentName: agent.name,
      snapshotInstructions: agent.instructions,
      snapshotScopes: agent.scopes,
      snapshotSkills: [],
      snapshotMaxSteps: agent.maxSteps,
      snapshotMaxTokens: agent.maxTokens,
      snapshotTimeoutSeconds: agent.timeoutSeconds,
      trigger: "MANUAL",
      idempotencyKey: `brief-fixture:${randomUUID()}`,
      status: "RUNNING",
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + 60_000),
      startedAt: new Date(),
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  });
  const generation = await db.executiveBriefGeneration.create({
    data: {
      workspaceId,
      period: "DAILY",
      sourceAgentRunId: run.id,
      sourceAgentRunWorkspaceId: workspaceId,
      sourceRunId: run.id,
      sourceAgentId: agent.id,
      sourceAgentName: agent.name,
    },
    select: { id: true },
  });
  return {
    generationId: generation.id,
    lease: { runId: run.id, agentId: agent.id, leaseToken },
  };
}

function publishInput(generationId: string, snapshotSha256: string) {
  return {
    generationId,
    snapshotSha256,
    headline: "Daily executive brief",
    summary: "Snapshot reviewed.",
    highlights: [],
    risks: [],
    opportunities: [],
    decisions: [],
  };
}

describe("executive brief lifecycle", () => {
  it("does not create a generation or run without an AI provider", async () => {
    const runsBefore = await db.agentRun.count({ where: { workspaceId } });
    await expect(
      generateExecutiveBriefNow(workspaceId, "DAILY"),
    ).rejects.toMatchObject({
      code: "MANAGEMENT_AI_NOT_CONFIGURED",
      status: 409,
    });
    expect(
      await db.executiveBriefGeneration.count({ where: { workspaceId } }),
    ).toBe(0);
    expect(await db.agentRun.count({ where: { workspaceId } })).toBe(
      runsBefore,
    );
  });

  it("repair creates missing system rows without overwriting edited rows", async () => {
    const first = await ensureExecutiveBriefSetup(workspaceId);
    await db.agent.update({
      where: { id: first.agent.id },
      data: { instructions: "Operator instruction", isActive: false },
    });
    await db.skill.update({
      where: { id: first.skill.id },
      data: { instructions: "Operator skill", isActive: false },
    });
    await ensureExecutiveBriefSetup(workspaceId);
    await expect(
      db.agent.findUniqueOrThrow({
        where: {
          workspaceId_systemKey: {
            workspaceId,
            systemKey: EXECUTIVE_BRIEF_AGENT_KEY,
          },
        },
        select: { instructions: true, isActive: true },
      }),
    ).resolves.toEqual({
      instructions: "Operator instruction",
      isActive: false,
    });
    await expect(
      db.skill.findUniqueOrThrow({
        where: {
          workspaceId_systemKey: {
            workspaceId,
            systemKey: EXECUTIVE_BRIEF_SKILL_KEY,
          },
        },
        select: { instructions: true, isActive: true },
      }),
    ).resolves.toEqual({ instructions: "Operator skill", isActive: false });
    await expect(
      getExecutiveBriefSetupStatus(workspaceId),
    ).resolves.toMatchObject({
      status: "EDITED",
      edited: expect.arrayContaining(["agent", "skill"]),
      parts: {
        agent: {
          id: first.agent.id,
          name: "Executive brief agent",
          isActive: false,
        },
        skill: {
          id: first.skill.id,
          name: "Executive brief workflow",
          isActive: false,
        },
        daily: {
          name: "Executive brief (daily)",
          minuteOfDay: 480,
        },
        weekly: {
          name: "Executive brief (weekly)",
          minuteOfDay: 495,
        },
      },
    });
  });

  it("rejects snapshot capture and publication after lease loss", async () => {
    const fixture = await createBriefRunFixture();
    await db.agentRun.update({
      where: { id: fixture.lease.runId },
      data: { leaseToken: randomUUID() },
    });
    await expect(
      captureExecutiveBriefSnapshotForRun(workspaceId, fixture.lease, "DAILY"),
    ).rejects.toMatchObject({
      code: "EXECUTIVE_BRIEF_RUN_LEASE_LOST",
      status: 409,
    });
    await expect(
      publishExecutiveBriefForRun(
        workspaceId,
        fixture.lease,
        publishInput(fixture.generationId, "a".repeat(64)),
      ),
    ).rejects.toMatchObject({
      code: "EXECUTIVE_BRIEF_RUN_LEASE_LOST",
      status: 409,
    });
  });

  it("does not materialize a scheduled run from an edited system Skill", async () => {
    const { agent, skill } = await ensureExecutiveBriefSetup(workspaceId);
    const schedule = await db.agentSchedule.findUniqueOrThrow({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY,
        },
      },
      select: { id: true },
    });
    await db.skill.update({
      where: { id: skill.id },
      data: { toolNames: ["management_snapshot_get"] },
    });
    await expect(
      createScheduledExecutiveBriefGeneration(
        workspaceId,
        agent.id,
        schedule.id,
        "DAILY",
        new Date(),
      ),
    ).resolves.toBe(false);
    expect(
      await db.agentRun.count({
        where: { workspaceId, scheduleId: schedule.id },
      }),
    ).toBe(0);
    expect(
      await db.executiveBriefGeneration.count({ where: { workspaceId } }),
    ).toBe(0);
  });

  it("rejects replaying a captured snapshot after lease loss", async () => {
    const fixture = await createBriefRunFixture();
    await captureExecutiveBriefSnapshotForRun(
      workspaceId,
      fixture.lease,
      "DAILY",
    );
    await db.agentRun.update({
      where: { id: fixture.lease.runId },
      data: { leaseToken: randomUUID() },
    });
    await expect(
      captureExecutiveBriefSnapshotForRun(workspaceId, fixture.lease, "DAILY"),
    ).rejects.toMatchObject({
      code: "EXECUTIVE_BRIEF_RUN_LEASE_LOST",
      status: 409,
    });
  });

  it("publishes a captured generation once when publication is replayed", async () => {
    const fixture = await createBriefRunFixture();
    const snapshot = await captureExecutiveBriefSnapshotForRun(
      workspaceId,
      fixture.lease,
      "DAILY",
    );
    const input = publishInput(fixture.generationId, snapshot.snapshotSha256);
    const first = await publishExecutiveBriefForRun(
      workspaceId,
      fixture.lease,
      input,
    );
    const second = await publishExecutiveBriefForRun(
      workspaceId,
      fixture.lease,
      input,
    );
    expect(second).toEqual(first);
    expect(await db.executiveBrief.count({ where: { workspaceId } })).toBe(1);
  });

  it("rejects proposed decisions with evidence outside the captured snapshot", async () => {
    const fixture = await createBriefRunFixture();
    const snapshot = await captureExecutiveBriefSnapshotForRun(
      workspaceId,
      fixture.lease,
      "DAILY",
    );
    await expect(
      publishExecutiveBriefForRun(workspaceId, fixture.lease, {
        ...publishInput(fixture.generationId, snapshot.snapshotSha256),
        decisions: [
          {
            title: "Foreign evidence",
            priority: "MEDIUM",
            evidenceRefs: ["alert:foreign-workspace"],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "EXECUTIVE_BRIEF_EVIDENCE_INVALID",
      status: 422,
    });

    await expect(
      publishExecutiveBriefForRun(workspaceId, fixture.lease, {
        ...publishInput(fixture.generationId, snapshot.snapshotSha256),
        highlights: [
          {
            title: "Unsupported highlight",
            detail: "This reference was not captured.",
            evidenceRefs: ["alert:foreign-workspace"],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "EXECUTIVE_BRIEF_EVIDENCE_INVALID",
      status: 422,
    });
  });

  it("keeps one active generation when scheduled and manual requests collide", async () => {
    await db.providerCredential.create({
      data: {
        workspaceId,
        provider: "OPENAI_COMPATIBLE",
        label: "Management test model",
        encryptedData: "x",
        iv: "x",
        authTag: "x",
        maskedHint: "****",
      },
    });
    const { agent } = await ensureExecutiveBriefSetup(workspaceId);
    const schedule = await db.agentSchedule.findUniqueOrThrow({
      where: {
        workspaceId_systemKey: {
          workspaceId,
          systemKey: EXECUTIVE_BRIEF_DAILY_SCHEDULE_KEY,
        },
      },
      select: { id: true },
    });
    expect(
      await createScheduledExecutiveBriefGeneration(
        workspaceId,
        agent.id,
        schedule.id,
        "DAILY",
        new Date(),
      ),
    ).toBe(true);
    const manual = await generateExecutiveBriefNow(workspaceId, "DAILY");
    expect(manual.active).toBe(true);
    expect(
      await db.executiveBriefGeneration.count({
        where: {
          workspaceId,
          period: "DAILY",
          status: { in: ["PENDING", "SNAPSHOT_READY"] },
        },
      }),
    ).toBe(1);
  });
});

async function noteDecision() {
  return createManualDecision(workspaceId, actor, {
    title: "Record the management outcome",
    priority: "HIGH",
    action: {
      type: "CREATE_NOTE",
      payload: {
        title: `Executive outcome ${randomUUID()}`,
        content: "Approved by a human operator.",
      },
    },
  });
}

describe("management decision execution", () => {
  it("requires rebind when a Kanban column id does not exist", async () => {
    await createBoard(workspaceId, { name: "Operations" });
    const decision = await createManualDecision(workspaceId, actor, {
      title: "Create a follow-up task",
      priority: "MEDIUM",
      action: {
        type: "CREATE_KANBAN_CARD",
        payload: { columnId: "TODO", title: "Review the incident" },
      },
    });

    const result = await approveAndExecuteDecision(
      workspaceId,
      decision.id,
      actor,
      { transition: "APPROVE", expectedVersion: decision.version },
    );

    expect(result.executionStatus).toBe("NEEDS_REBIND");
    expect(result.lastExecutionErrorCode).toBe(
      "MANAGEMENT_KANBAN_TARGET_NOT_FOUND",
    );
    expect(await db.kanbanCard.count({ where: { workspaceId } })).toBe(0);
    await expect(
      db.decisionEvent.findFirstOrThrow({
        where: { decisionId: decision.id, type: "ACTION_FAILED" },
        select: { toExecutionStatus: true },
      }),
    ).resolves.toEqual({ toExecutionStatus: "NEEDS_REBIND" });
  });

  it("lists only the current workspace Kanban destinations", async () => {
    const board = await createBoard(workspaceId, { name: "Executive work" });
    const targets = await listManagementKanbanTargets(workspaceId);
    const foreignTargets = await listManagementKanbanTargets(otherWorkspaceId);

    expect(targets).toEqual([
      expect.objectContaining({
        id: board.id,
        name: "Executive work",
        columns: expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String) }),
        ]),
      }),
    ]);
    expect(foreignTargets).not.toContainEqual(
      expect.objectContaining({ id: board.id }),
    );
  });

  it("keeps an edited failed approved action ready for retry", async () => {
    const decision = await noteDecision();
    const approved = await transitionDecision(workspaceId, decision.id, actor, {
      transition: "APPROVE",
      expectedVersion: decision.version,
    });
    const failed = await db.decision.update({
      where: { id: decision.id },
      data: {
        executionStatus: "FAILED",
        lastExecutionErrorCode: "TEST_FAILURE",
        lastExecutionError: "Synthetic safe failure.",
      },
    });
    expect(approved.executionStatus).toBe("READY");
    const updated = await updateDecision(workspaceId, decision.id, actor, {
      expectedVersion: failed.version,
      action: {
        type: "CREATE_NOTE",
        payload: { title: "Revised target", content: "Retry this revision." },
      },
    });
    expect(updated.executionStatus).toBe("READY");
    const completed = await executeDecisionAction(
      workspaceId,
      decision.id,
      actor,
      updated.version,
    );
    expect(completed.executionStatus).toBe("SUCCEEDED");
  });

  it("atomically commits one Note, Receipt, Event and NoteIndexJob", async () => {
    const decision = await noteDecision();
    const result = await approveAndExecuteDecision(
      workspaceId,
      decision.id,
      actor,
      { transition: "APPROVE", expectedVersion: decision.version },
    );

    expect(result.status).toBe("APPROVED");
    expect(result.executionStatus).toBe("SUCCEEDED");
    expect(
      await db.decisionActionReceipt.count({
        where: { decisionId: decision.id },
      }),
    ).toBe(1);
    expect(await db.note.count({ where: { workspaceId } })).toBe(1);
    expect(await db.noteIndexJob.count({ where: { workspaceId } })).toBe(1);
    expect(
      await db.decisionEvent.count({
        where: { decisionId: decision.id, type: "PRIMARY_COMMITTED" },
      }),
    ).toBe(1);
  });

  it("lets one of two concurrent approvals win without duplicate targets", async () => {
    const decision = await noteDecision();
    const attempts = await Promise.allSettled([
      approveAndExecuteDecision(workspaceId, decision.id, actor, {
        transition: "APPROVE",
        expectedVersion: decision.version,
      }),
      approveAndExecuteDecision(workspaceId, decision.id, actor, {
        transition: "APPROVE",
        expectedVersion: decision.version,
      }),
    ]);

    expect(
      attempts.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await db.note.count({ where: { workspaceId } })).toBe(1);
    expect(
      await db.decisionActionReceipt.count({
        where: { decisionId: decision.id },
      }),
    ).toBe(1);
  });

  it("never replays an action after its Receipt exists", async () => {
    const decision = await noteDecision();
    await approveAndExecuteDecision(workspaceId, decision.id, actor, {
      transition: "APPROVE",
      expectedVersion: decision.version,
    });
    const completed = await getDecision(workspaceId, decision.id);

    await expect(
      executeDecisionAction(workspaceId, decision.id, actor, completed.version),
    ).rejects.toMatchObject({
      code: "DECISION_ACTION_ALREADY_COMMITTED",
      status: 409,
    });
    expect(await db.note.count({ where: { workspaceId } })).toBe(1);
  });

  it("does not expose a Decision through another workspace", async () => {
    const decision = await noteDecision();
    await expect(
      getDecision(otherWorkspaceId, decision.id),
    ).rejects.toMatchObject({
      code: "MANAGEMENT_DECISION_NOT_FOUND",
      status: 404,
    });
  });

  it("executes Kanban, Reminder and local Mail draft actions", async () => {
    const board = await createBoard(workspaceId, { name: "Executive actions" });
    const boardDetail = await getBoard(workspaceId, board.id);
    const columnId = boardDetail?.columns[0]?.id;
    if (!columnId) throw new Error("Kanban board did not create a column.");
    const account = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "IMAP",
        mode: "MOCK",
        name: "Management drafts",
        email: "management@example.test",
      },
    });
    await db.mailFolder.create({
      data: {
        workspaceId,
        accountId: account.id,
        accountWorkspaceId: workspaceId,
        path: "Drafts",
        name: "Drafts",
        specialUse: "DRAFTS",
      },
    });

    const inputs = [
      {
        title: "Create executive card",
        priority: "MEDIUM" as const,
        action: {
          type: "CREATE_KANBAN_CARD" as const,
          payload: { columnId, title: "Review operating risk" },
        },
      },
      {
        title: "Create executive reminder",
        priority: "MEDIUM" as const,
        action: {
          type: "CREATE_REMINDER" as const,
          payload: {
            title: "Review decision",
            dueAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
        },
      },
      {
        title: "Create executive draft",
        priority: "MEDIUM" as const,
        action: {
          type: "CREATE_MAIL_DRAFT" as const,
          payload: {
            accountId: account.id,
            to: ["owner@example.test"],
            cc: [],
            bcc: [],
            subject: "Decision follow-up",
            bodyText: "Draft only. Do not send.",
            bodyHtml: "",
          },
        },
      },
    ];

    for (const [index, input] of inputs.entries()) {
      const decision = await createManualDecision(workspaceId, actor, input);
      const result = await approveAndExecuteDecision(
        workspaceId,
        decision.id,
        actor,
        { transition: "APPROVE", expectedVersion: decision.version },
      );
      expect(result.executionStatus).toBe("SUCCEEDED");
      if (index === 0) {
        expect(result.resultHref).toBe(
          `/kanban/${board.id}?card=${result.resultId}`,
        );
      }
    }

    expect(await db.kanbanCard.count({ where: { workspaceId } })).toBe(1);
    expect(await db.reminder.count({ where: { workspaceId } })).toBe(1);
    expect(
      await db.mailItem.count({
        where: { workspaceId, folder: { specialUse: "DRAFTS" } },
      }),
    ).toBe(1);
    expect(
      await db.decisionActionReceipt.count({ where: { workspaceId } }),
    ).toBe(3);
  });

  it("builds a hash-stable bounded snapshot without mail bodies", async () => {
    const account = await db.mailAccount.create({
      data: {
        workspaceId,
        kind: "IMAP",
        mode: "MOCK",
        name: "Snapshot inbox",
        email: "snapshot@example.test",
      },
    });
    const inbox = await db.mailFolder.create({
      data: {
        workspaceId,
        accountId: account.id,
        accountWorkspaceId: workspaceId,
        path: "INBOX",
        name: "Inbox",
        specialUse: "INBOX",
      },
    });
    await db.mailItem.create({
      data: {
        workspaceId,
        accountId: account.id,
        accountWorkspaceId: workspaceId,
        folderId: inbox.id,
        folderWorkspaceId: workspaceId,
        fromAddress: "sender@example.test",
        subject: "Visible management subject",
        snippet: "Visible bounded snippet",
        bodyText: "SECRET FULL MAIL BODY MUST NOT ENTER SNAPSHOT",
        bodyHtml: "<p>SECRET HTML BODY</p>",
      },
    });
    const now = new Date("2026-08-26T12:00:00.000Z");
    const first = await buildExecutiveSnapshot(workspaceId, "DAILY", now);
    const second = await buildExecutiveSnapshot(workspaceId, "DAILY", now);

    expect(second.hash).toBe(first.hash);
    expect(first.byteLength).toBeLessThanOrEqual(EXECUTIVE_SNAPSHOT_MAX_BYTES);
    expect(first.canonical).toContain("Visible management subject");
    expect(first.canonical).not.toContain("SECRET FULL MAIL BODY");
    expect(first.canonical).not.toContain("SECRET HTML BODY");
  });
});
