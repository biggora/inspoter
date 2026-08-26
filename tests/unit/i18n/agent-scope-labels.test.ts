import { describe, expect, it } from "vitest";
import enAgents from "@/messages/en/agents.json";
import ruAgents from "@/messages/ru/agents.json";
import lvAgents from "@/messages/lv/agents.json";
import { AGENT_SCOPES } from "@/lib/agents/scopes";

// The agent Access matrix derives its row label from the scope's own domain
// (`domain${Capitalize(domain)}` in agent-scopes-field.tsx), so adding a scope
// to AGENT_SCOPES without a label makes next-intl throw MISSING_MESSAGE while
// rendering — visible only in the server log. This is the guard that turns
// that into a failing test instead.

const DOMAINS = [...new Set(AGENT_SCOPES.map((scope) => scope.split(":")[0]))];

function labelKey(domain: string): string {
  return `domain${domain.charAt(0).toUpperCase()}${domain.slice(1)}`;
}

describe("agent scope labels", () => {
  it.each(DOMAINS)(
    "has a label for the %s domain in every locale",
    (domain) => {
      const key = labelKey(domain);
      expect(enAgents).toHaveProperty(key);
      expect(ruAgents).toHaveProperty(key);
      expect(lvAgents).toHaveProperty(key);
    },
  );
});
