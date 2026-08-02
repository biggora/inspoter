import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DISCORD_ERROR,
  discordError,
  zodIssuesToDiscordErrors,
  unauthorized,
} from "@/lib/discord/errors";

// specs/discord-webhook-compatibility.md §4.

function issuesOf(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected the value to fail validation");
  return result.error.issues;
}

describe("Discord error bodies", () => {
  it("nests field errors by path with an _errors leaf", () => {
    const schema = z.object({
      embeds: z.array(z.object({ title: z.string().max(3) })),
    });
    const errors = zodIssuesToDiscordErrors(
      issuesOf(schema, { embeds: [{ title: "too long" }] }),
    );

    expect(errors).toEqual({
      embeds: {
        "0": {
          title: {
            _errors: [
              { code: "BASE_TYPE_MAX_LENGTH", message: expect.any(String) },
            ],
          },
        },
      },
    });
  });

  it("marks a missing required field as BASE_TYPE_REQUIRED", () => {
    const schema = z.object({ content: z.string() });
    const errors = zodIssuesToDiscordErrors(issuesOf(schema, {}));
    expect(errors.content).toMatchObject({
      _errors: [{ code: "BASE_TYPE_REQUIRED" }],
    });
  });

  it("collects several issues for the same path", () => {
    const schema = z.object({ a: z.string().max(1), b: z.string().max(1) });
    const errors = zodIssuesToDiscordErrors(
      issuesOf(schema, { a: "xx", b: "yy" }),
    );
    expect(Object.keys(errors).sort()).toEqual(["a", "b"]);
  });

  it("returns the Discord envelope with code and message", async () => {
    const response = discordError(
      400,
      DISCORD_ERROR.CANNOT_SEND_EMPTY_MESSAGE,
      "Cannot send an empty message",
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      message: "Cannot send an empty message",
      code: 50006,
    });
  });

  it("answers an unknown or revoked credential with Discord's 401 body", async () => {
    const response = unauthorized();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "401: Unauthorized",
      code: 0,
    });
  });
});
