import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as agentsService from "@/lib/services/agents";
import * as skillsService from "@/lib/services/skills";

let workspaceId: string;
let otherWorkspaceId: string;

async function makeWorkspace(slugPrefix: string): Promise<string> {
  const workspace = await db.workspace.create({
    data: {
      name: "Agents test workspace",
      slug: `${slugPrefix}-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  return workspace.id;
}

async function makeAgent(id: string, name: string) {
  return agentsService.createAgent(id, {
    name,
    instructions: "Report what changed.",
  });
}

async function makeSkill(id: string, name: string) {
  return skillsService.createSkill(id, {
    name,
    description: "One line.",
    instructions: "Body.",
  });
}

beforeAll(async () => {
  workspaceId = await makeWorkspace("agents");
  otherWorkspaceId = await makeWorkspace("agents-other");
});

afterAll(async () => {
  for (const id of [workspaceId, otherWorkspaceId]) {
    if (id) await db.workspace.delete({ where: { id } }).catch(() => {});
  }
});

beforeEach(async () => {
  const workspaces = { in: [workspaceId, otherWorkspaceId] };
  await db.agent.deleteMany({ where: { workspaceId: workspaces } });
  await db.skill.deleteMany({ where: { workspaceId: workspaces } });
});

describe("agent CRUD", () => {
  it("round-trips an agent through create, read, update and delete", async () => {
    const created = await agentsService.createAgent(workspaceId, {
      name: "Night watch",
      description: "Overnight summary",
      instructions: "Summarize what broke overnight.",
      scopes: ["logs:read", "alerts:read"],
    });
    // Stored in the order the caller sent; the scope picker already emits
    // them in MCP_SCOPES order, so no second canonicalization is needed.
    expect(created.scopes).toEqual(["logs:read", "alerts:read"]);
    expect(created.skillCount).toBe(0);
    expect(created.maxSteps).toBe(8);

    const read = await agentsService.getAgent(workspaceId, created.id);
    expect(read.instructions).toBe("Summarize what broke overnight.");

    const updated = await agentsService.updateAgent(workspaceId, created.id, {
      scopes: ["kanban:read", "kanban:write"],
      isActive: false,
    });
    expect(updated.scopes).toEqual(["kanban:read", "kanban:write"]);
    expect(updated.isActive).toBe(false);

    await agentsService.deleteAgent(workspaceId, created.id);
    await expect(
      agentsService.getAgent(workspaceId, created.id),
    ).rejects.toBeInstanceOf(agentsService.AgentNotFoundError);
  });

  it("rejects a second agent with the same normalized name", async () => {
    await makeAgent(workspaceId, "Night Watch");
    await expect(
      makeAgent(workspaceId, "  night   watch "),
    ).rejects.toBeInstanceOf(agentsService.AgentNameConflictError);
  });

  it("keeps the same name available in another workspace", async () => {
    await makeAgent(workspaceId, "Night watch");
    await expect(
      makeAgent(otherWorkspaceId, "Night watch"),
    ).resolves.toMatchObject({ name: "Night watch" });
  });

  it("does not disclose an agent from another workspace", async () => {
    const foreign = await makeAgent(otherWorkspaceId, "Foreign");
    await expect(
      agentsService.getAgent(workspaceId, foreign.id),
    ).rejects.toBeInstanceOf(agentsService.AgentNotFoundError);
    await expect(
      agentsService.updateAgent(workspaceId, foreign.id, { isActive: false }),
    ).rejects.toBeInstanceOf(agentsService.AgentNotFoundError);
    await expect(
      agentsService.deleteAgent(workspaceId, foreign.id),
    ).rejects.toBeInstanceOf(agentsService.AgentNotFoundError);
  });

  it("drops a scope no longer known to this deployment on read", async () => {
    const agent = await makeAgent(workspaceId, "Legacy");
    // Written by a newer deployment that knows a scope this one does not.
    await db.agent.update({
      where: { id: agent.id },
      data: { scopes: ["logs:read", "quantum:write"] },
    });
    const read = await agentsService.getAgent(workspaceId, agent.id);
    expect(read.scopes).toEqual(["logs:read"]);
  });
});

describe("skill CRUD", () => {
  it("rejects a tool name the catalogue does not contain", async () => {
    await expect(
      skillsService.createSkill(workspaceId, {
        name: "Typo",
        description: "…",
        instructions: "…",
        toolNames: ["logs_search", "logs_serch"],
      }),
    ).rejects.toMatchObject({ unknownTools: ["logs_serch"] });
  });

  it("accepts a tool name the catalogue does contain", async () => {
    const skill = await skillsService.createSkill(workspaceId, {
      name: "Log reader",
      description: "…",
      instructions: "…",
      toolNames: ["logs_search"],
    });
    expect(skill.toolNames).toEqual(["logs_search"]);
  });
});

describe("setAgentSkills", () => {
  it("stores the attachment order the caller sent", async () => {
    const agent = await makeAgent(workspaceId, "Ordered");
    const first = await makeSkill(workspaceId, "Alpha");
    const second = await makeSkill(workspaceId, "Beta");

    const withSkills = await agentsService.setAgentSkills(
      workspaceId,
      agent.id,
      [second.id, first.id],
    );
    expect(withSkills.skills.map((skill) => skill.name)).toEqual([
      "Beta",
      "Alpha",
    ]);
    expect(withSkills.skillCount).toBe(2);

    // Replacing the set is also how it is reordered.
    const reordered = await agentsService.setAgentSkills(
      workspaceId,
      agent.id,
      [first.id, second.id],
    );
    expect(reordered.skills.map((skill) => skill.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("detaches everything when given an empty list", async () => {
    const agent = await makeAgent(workspaceId, "Emptied");
    const skill = await makeSkill(workspaceId, "Alpha");
    await agentsService.setAgentSkills(workspaceId, agent.id, [skill.id]);

    const cleared = await agentsService.setAgentSkills(
      workspaceId,
      agent.id,
      [],
    );
    expect(cleared.skills).toEqual([]);
  });

  it("refuses a skill from another workspace", async () => {
    const agent = await makeAgent(workspaceId, "Borrower");
    const foreign = await makeSkill(otherWorkspaceId, "Foreign");

    await expect(
      agentsService.setAgentSkills(workspaceId, agent.id, [foreign.id]),
    ).rejects.toBeInstanceOf(agentsService.SkillNotInWorkspaceError);

    const unchanged = await agentsService.getAgent(workspaceId, agent.id);
    expect(unchanged.skills).toEqual([]);
  });

  it("detaches a deleted skill without touching the agent", async () => {
    const agent = await makeAgent(workspaceId, "Survivor");
    const skill = await makeSkill(workspaceId, "Temporary");
    await agentsService.setAgentSkills(workspaceId, agent.id, [skill.id]);

    await skillsService.deleteSkill(workspaceId, skill.id);

    const after = await agentsService.getAgent(workspaceId, agent.id);
    expect(after.skills).toEqual([]);
    expect(after.isActive).toBe(true);
  });
});
