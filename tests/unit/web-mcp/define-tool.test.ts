import { z } from "zod";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { defineWebMcpTool } from "@/lib/web-mcp/define-tool";
import { expectToolError, expectToolJson, expectToolText } from "./test-utils";

const simpleSchema = z.object({ x: z.string().describe("x") });

describe("defineWebMcpTool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("converts inputSchema to JSON Schema via z.toJSONSchema()", () => {
    const expectedJsonSchema = z.toJSONSchema(simpleSchema);
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => ({ ok: true }),
    });

    expect(tool.inputSchema).toEqual(expectedJsonSchema);

    const properties = (
      tool.inputSchema as { properties?: Record<string, unknown> }
    ).properties;
    expect(properties).toMatchObject({
      x: { type: "string", description: "x" },
    });
  });

  it("defaults annotations to false when readOnly/untrustedOutput are omitted", () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => ({ ok: true }),
    });

    expect(tool.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: false,
    });
  });

  it("reflects config.readOnly and config.untrustedOutput in annotations", () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      readOnly: true,
      untrustedOutput: true,
      handler: async () => ({ ok: true }),
    });

    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  it("calls the handler with parsed input and returns its result as a JSON text block", async () => {
    const handler = vi.fn().mockResolvedValue({ result: 42 });
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler,
    });

    const result = await tool.execute({ x: "hello" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ x: "hello" });
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ result: 42 }) }],
    });
    expect(result.isError).toBeUndefined();
    expect(expectToolJson(result)).toEqual({ result: 42 });
  });

  it("passes a string handler result through as raw text, not double-encoded JSON", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => "plain text result",
    });

    const result = await tool.execute({ x: "hello" });

    expect(expectToolText(result)).toBe("plain text result");
  });

  it("JSON-stringifies a non-string handler result", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => [1, 2, 3],
    });

    const result = await tool.execute({ x: "hello" });

    expect(expectToolText(result)).toBe("[1,2,3]");
  });

  it("encodes an undefined handler result as null", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => undefined,
    });

    const result = await tool.execute({ x: "hello" });

    expect(expectToolText(result)).toBe("null");
  });

  it("returns an isError result without calling the handler on invalid input", async () => {
    const handler = vi.fn();
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler,
    });

    const result = await tool.execute({ x: 123 });

    expect(handler).toHaveBeenCalledTimes(0);
    expect(expectToolError(result).startsWith("Invalid input: ")).toBe(true);
  });

  it("resolves to an isError result carrying the message when the handler throws an Error", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw new Error("boom");
      },
    });

    await expect(tool.execute({ x: "hello" })).resolves.toEqual({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });
  });

  it("never rejects — a throwing handler resolves rather than propagating", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw new Error("boom");
      },
    });

    await expect(tool.execute({ x: "hello" })).resolves.toBeDefined();
  });

  it("falls back to a generic message when the handler throws a non-Error string", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw "oops";
      },
    });

    const result = await tool.execute({ x: "hello" });

    expect(expectToolError(result)).toBe("Unexpected error.");
  });

  it("falls back to a generic message when the handler throws a non-Error object", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw { weird: true };
      },
    });

    const result = await tool.execute({ x: "hello" });

    expect(expectToolError(result)).toBe("Unexpected error.");
  });

  describe("dev-mode budget warnings", () => {
    let warnSpy: MockInstance<(...args: unknown[]) => void>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("warns when the tool name exceeds 30 chars in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      defineWebMcpTool({
        name: "a_very_long_tool_name_that_exceeds_the_budget",
        description: "Short description.",
        inputSchema: simpleSchema,
        handler: async () => ({}),
      });

      expect(warnSpy).toHaveBeenCalled();
      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes("longer than the recommended 30"),
        ),
      ).toBe(true);
    });

    it("warns when the description exceeds 500 chars in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      defineWebMcpTool({
        name: "example_tool",
        description: "x".repeat(501),
        inputSchema: simpleSchema,
        handler: async () => ({}),
      });

      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes("longer than the recommended 500"),
        ),
      ).toBe(true);
    });

    it("warns when a schema property description exceeds 150 chars in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      const longDescSchema = z.object({
        y: z.string().describe("y".repeat(151)),
      });
      defineWebMcpTool({
        name: "example_tool",
        description: "Short description.",
        inputSchema: longDescSchema,
        handler: async () => ({}),
      });

      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes("longer than the recommended 150"),
        ),
      ).toBe(true);
    });

    it("warns when a schema property has no description in development", () => {
      vi.stubEnv("NODE_ENV", "development");
      const noDescSchema = z.object({ y: z.string() });
      defineWebMcpTool({
        name: "example_tool",
        description: "Short description.",
        inputSchema: noDescSchema,
        handler: async () => ({}),
      });

      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes('property "y" has no description'),
        ),
      ).toBe(true);
    });

    it("does not warn in production mode even when budgets are exceeded", () => {
      vi.stubEnv("NODE_ENV", "production");
      defineWebMcpTool({
        name: "a_very_long_tool_name_that_exceeds_the_budget",
        description: "x".repeat(501),
        inputSchema: z.object({ y: z.string() }),
        handler: async () => ({}),
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("execute() behavior is unaffected by whether a warning fired", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const handler = vi.fn().mockResolvedValue({ ok: true });
      const tool = defineWebMcpTool({
        name: "a_very_long_tool_name_that_exceeds_the_budget",
        description: "x".repeat(501),
        inputSchema: simpleSchema,
        handler,
      });

      expect(warnSpy).toHaveBeenCalled();
      const result = await tool.execute({ x: "hello" });
      expect(handler).toHaveBeenCalledWith({ x: "hello" });
      expect(expectToolJson(result)).toEqual({ ok: true });
    });
  });
});
