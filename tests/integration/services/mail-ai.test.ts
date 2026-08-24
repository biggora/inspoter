import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as credentialsService from "@/lib/services/credentials";
import * as mailAiService from "@/lib/services/mail-ai";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import * as mailService from "@/lib/services/mail";
import { MailItemNotFoundError } from "@/lib/services/mail-actions";
import { MAX_PROMPT_BODY_CHARS } from "@/lib/mail/ai-prompts";

// Service-level cases the route suite cannot reach: what a missing message
// does, and that an over-long body is reported as truncated to the operator
// rather than silently shortened.

process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const PREFIX = `mail-ai-svc-${randomUUID()}`;
const CALLER = { operatorId: "op-1", operatorName: "operator" };

let workspaceId: string;
let shortMailId: string;
let longMailId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: { name: `${PREFIX}-workspace`, slug: `${PREFIX}-workspace` },
  });
  workspaceId = workspace.id;
  await getOrCreateWebhookAccount(workspaceId);

  await credentialsService.createCredential(
    workspaceId,
    "ANTHROPIC_COMPATIBLE",
    `${PREFIX}-model`,
    {
      type: "ANTHROPIC_COMPATIBLE",
      // MOCK is selected before the transport, so the endpoint is never
      // reached — asserting that is half the point of using the Anthropic
      // type here rather than the OpenAI one.
      baseUrl: "http://127.0.0.1:9/anthropic",
      model: "mock-glm",
      apiKey: "mock-key",
      mode: "MOCK",
    },
  );

  shortMailId = (
    await mailService.create(workspaceId, {
      sender: "alerts@vendor.example",
      subject: "Disk usage warning",
      body: "The disk is at 85%.",
    })
  ).id;
  longMailId = (
    await mailService.create(workspaceId, {
      sender: "reports@vendor.example",
      subject: "Weekly report",
      body: "y".repeat(MAX_PROMPT_BODY_CHARS + 2000),
    })
  ).id;
});

afterAll(async () => {
  await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
});

describe("summarizeMailMessage()", () => {
  it("works through the MOCK driver even for the Anthropic transport", async () => {
    const result = await mailAiService.summarizeMailMessage(
      workspaceId,
      shortMailId,
      CALLER,
      { language: "en" },
    );

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.data.model).toBe("mock-glm");
    expect(result.ok && result.data.truncated).toBe(false);
  });

  it("reports a truncated body instead of shortening it silently", async () => {
    const result = await mailAiService.summarizeMailMessage(
      workspaceId,
      longMailId,
      CALLER,
      { language: "en" },
    );

    expect(result.ok && result.data.truncated).toBe(true);
  });

  it("throws for a message that does not exist", async () => {
    await expect(
      mailAiService.summarizeMailMessage(workspaceId, "nope", CALLER, {
        language: "en",
      }),
    ).rejects.toBeInstanceOf(MailItemNotFoundError);
  });
});

describe("draftMailReply()", () => {
  it("returns body text and persists nothing", async () => {
    const before = await db.mailItem.count({ where: { workspaceId } });

    const result = await mailAiService.draftMailReply(
      workspaceId,
      shortMailId,
      CALLER,
      { language: "ru" },
    );

    expect(result.ok && result.data.bodyText.length).toBeGreaterThan(0);
    expect(await db.mailItem.count({ where: { workspaceId } })).toBe(before);
  });
});

describe("proposeMailFilterRule()", () => {
  it("returns conditions the deterministic engine accepts", async () => {
    const result = await mailAiService.proposeMailFilterRule(
      workspaceId,
      shortMailId,
      CALLER,
      { language: "en" },
    );

    expect(result.ok && result.data.conditions).toEqual([
      {
        field: "FROM_DOMAIN",
        operator: "EQUALS",
        value: "vendor.example",
        isNegated: false,
      },
    ]);
    expect(result.ok && result.data.droppedConditions).toBe(0);
  });
});
