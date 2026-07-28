import { describe, expect, it } from "vitest";
import {
  createWebhookTokenSchema,
  updateWebhookTokenScopesSchema,
} from "@/lib/validation/webhookTokens";

describe("createWebhookTokenSchema", () => {
  it("defaults scopes to an empty array so the pre-MCP body still validates", () => {
    const parsed = createWebhookTokenSchema.parse({ name: "CI pipeline" });

    expect(parsed).toEqual({ name: "CI pipeline", scopes: [] });
  });

  it("accepts the declared scopes", () => {
    const parsed = createWebhookTokenSchema.parse({
      name: "Assistant",
      scopes: ["mail:read", "mail:write", "logs:read"],
    });

    expect(parsed.scopes).toEqual(["mail:read", "mail:write", "logs:read"]);
  });

  it("rejects an unknown scope", () => {
    const result = createWebhookTokenSchema.safeParse({
      name: "Assistant",
      scopes: ["mail:delete"],
    });

    expect(result.success).toBe(false);
  });

  it("still requires a non-blank name", () => {
    expect(
      createWebhookTokenSchema.safeParse({ name: "   ", scopes: [] }).success,
    ).toBe(false);
  });
});

describe("updateWebhookTokenScopesSchema", () => {
  it("accepts an empty array, which downgrades the token to webhooks only", () => {
    expect(updateWebhookTokenScopesSchema.parse({ scopes: [] })).toEqual({
      scopes: [],
    });
  });

  it("requires the scopes key and rejects extra keys", () => {
    expect(updateWebhookTokenScopesSchema.safeParse({}).success).toBe(false);
    expect(
      updateWebhookTokenScopesSchema.safeParse({
        scopes: ["logs:read"],
        name: "renamed",
      }).success,
    ).toBe(false);
  });
});
