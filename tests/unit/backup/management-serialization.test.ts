import { describe, expect, it } from "vitest";
import { backupPayloadSchema } from "@/lib/backup/serialization";

const timestamp = "2026-08-26T12:00:00.000Z";

function managementPayload() {
  return {
    manifest: {
      schemaVersion: 1,
      exportedAt: timestamp,
      appVersion: "0.0.0-test",
      workspace: {
        id: "workspace-source",
        name: "Source",
        slug: "source",
        hiddenSections: [],
        timeZone: "UTC",
      },
      sections: ["management"],
      counts: {},
    },
    data: {
      executiveBriefGenerations: [
        {
          id: "generation-1",
          period: "DAILY",
          status: "PUBLISHED",
          sourceRunId: "run-1",
          sourceAgentId: "agent-1",
          sourceAgentName: "Agent",
          snapshotVersion: 1,
          snapshot: { generatedAt: timestamp },
          snapshotHash: "snapshot-hash",
          snapshotByteLength: 32,
          snapshotCapturedAt: timestamp,
          publishedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      executiveBriefs: [
        {
          id: "brief-1",
          generationId: "generation-1",
          period: "DAILY",
          windowStart: timestamp,
          windowEnd: "2026-08-26T13:00:00.000Z",
          snapshotAsOf: timestamp,
          headline: "Brief",
          summary: "Summary",
          highlights: [],
          risks: [],
          opportunities: [],
          snapshotHash: "snapshot-hash",
          sourceRunId: "run-1",
          sourceAgentId: "agent-1",
          sourceAgentName: "Agent",
          publishedAt: timestamp,
          createdAt: timestamp,
        },
      ],
      decisions: [
        {
          id: "decision-1",
          briefId: "brief-1",
          origin: "EXECUTIVE_BRIEF",
          title: "Decision",
          context: null,
          recommendation: null,
          evidenceRefs: [],
          priority: "MEDIUM",
          dueAt: null,
          status: "APPROVED",
          deferredUntil: null,
          resolutionNote: null,
          actionType: "CREATE_NOTE",
          actionPayload: { title: "Note", content: "" },
          actionRevision: 1,
          executionStatus: "SUCCEEDED",
          executionAttempts: 1,
          lastExecutionErrorCode: null,
          lastExecutionError: null,
          executedAt: timestamp,
          resultType: "NOTE",
          resultId: "note-1",
          resultLabel: "Note",
          resultHref: "/notes?note=note-1",
          createdByType: "AGENT",
          createdById: "agent-1",
          createdByName: "Agent",
          resolvedByOperatorId: "operator-1",
          resolvedByOperatorName: "Operator",
          resolvedAt: timestamp,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      decisionActionReceipts: [
        {
          id: "receipt-1",
          decisionId: "decision-1",
          actionRevision: 1,
          actionType: "CREATE_NOTE",
          payloadHash: "a".repeat(64),
          historicalTargetId: "note-1",
          historicalTargetType: "NOTE",
          historicalTargetLabel: "Note",
          historicalTargetHref: "/notes?note=note-1",
          liveTargetId: "note-1",
          liveTargetHref: "/notes?note=note-1",
          targetAvailability: "AVAILABLE",
          committedAt: timestamp,
          createdAt: timestamp,
        },
      ],
      decisionEvents: [
        {
          id: "event-1",
          decisionId: "decision-1",
          receiptId: "receipt-1",
          sequence: 1,
          type: "PRIMARY_COMMITTED",
          actorKind: "SYSTEM",
          actorId: "system",
          actorName: "System",
          fromStatus: "APPROVED",
          toStatus: "APPROVED",
          fromExecutionStatus: "RUNNING",
          toExecutionStatus: "SUCCEEDED",
          actionRevision: 1,
          payloadHash: "a".repeat(64),
          targetType: "NOTE",
          targetId: "note-1",
          targetLabel: "Note",
          errorCode: null,
          errorMessage: null,
          createdAt: timestamp,
        },
      ],
    },
  };
}

describe("management backup serialization", () => {
  it("accepts a consistent published management history graph", () => {
    expect(backupPayloadSchema.safeParse(managementPayload()).success).toBe(
      true,
    );
  });

  it("rejects a succeeded decision whose receipt target differs", () => {
    const payload = managementPayload();
    payload.data.decisionActionReceipts[0].historicalTargetId = "other-note";
    expect(backupPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects duplicate decision receipt revisions", () => {
    const payload = managementPayload();
    payload.data.decisionActionReceipts.push({
      ...payload.data.decisionActionReceipts[0],
      id: "receipt-2",
    });
    expect(backupPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
