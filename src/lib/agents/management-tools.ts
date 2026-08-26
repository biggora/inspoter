import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AgentToolBinding, AgentToolContext } from "@/lib/agents/tools";
import {
  captureExecutiveBriefSnapshotForRun,
  publishExecutiveBriefForRun,
} from "@/lib/services/executive-briefs";
import { publishExecutiveBriefSchema } from "@/lib/validation/management";

function textResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

const snapshotSchema = z
  .object({ period: z.enum(["DAILY", "WEEKLY"]) })
  .strict();

async function getSnapshot(
  args: unknown,
  context: AgentToolContext,
): Promise<CallToolResult> {
  const parsed = snapshotSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: parsed.error.issues }) },
      ],
      isError: true,
    };
  }
  return textResult(
    await captureExecutiveBriefSnapshotForRun(
      context.workspaceId,
      {
        runId: context.runId,
        agentId: context.agentId,
        leaseToken: context.leaseToken,
      },
      parsed.data.period,
    ),
  );
}

async function publishBrief(
  args: unknown,
  context: AgentToolContext,
): Promise<CallToolResult> {
  const parsed = publishExecutiveBriefSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: parsed.error.issues }) },
      ],
      isError: true,
    };
  }
  return textResult(
    await publishExecutiveBriefForRun(
      context.workspaceId,
      {
        runId: context.runId,
        agentId: context.agentId,
        leaseToken: context.leaseToken,
      },
      parsed.data,
    ),
  );
}

export const managementAgentTools: AgentToolBinding[] = [
  {
    name: "management_snapshot_get",
    scope: "management:read",
    readOnly: true,
    definition: {
      name: "management_snapshot_get",
      description:
        "Capture and read the exact snapshot for this executive brief run.",
      inputSchema: z.toJSONSchema(snapshotSchema, { io: "input" }),
    },
    invoke: getSnapshot,
  },
  {
    name: "management_brief_publish",
    scope: "management:write",
    readOnly: false,
    definition: {
      name: "management_brief_publish",
      description: "Publish the executive brief from the bound snapshot.",
      inputSchema: z.toJSONSchema(publishExecutiveBriefSchema, { io: "input" }),
    },
    invoke: publishBrief,
  },
];
