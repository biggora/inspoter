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

  it("calls the handler with parsed input and returns its result on valid input", async () => {
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
    expect(result).toEqual({ result: 42 });
  });

  it("returns { error } without calling the handler on invalid input", async () => {
    const handler = vi.fn();
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler,
    });

    const result = await tool.execute({ x: 123 });

    expect(handler).toHaveBeenCalledTimes(0);
    expect(result).toMatchObject({ error: expect.any(String) });
    expect((result as { error: string }).error.startsWith("Invalid input")).toBe(
      true,
    );
  });

  it("resolves to { error: message } when the handler throws an Error", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw new Error("boom");
      },
    });

    await expect(tool.execute({ x: "hello" })).resolves.toEqual({
      error: "boom",
    });
  });

  it("resolves to { error: <fallback> } when the handler throws a non-Error string", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw "oops";
      },
    });

    await expect(tool.execute({ x: "hello" })).resolves.toEqual({
      error: "Unexpected error.",
    });
  });

  it("resolves to { error: <fallback> } when the handler throws a non-Error object", async () => {
    const tool = defineWebMcpTool({
      name: "example_tool",
      description: "An example tool.",
      inputSchema: simpleSchema,
      handler: async () => {
        throw { weird: true };
      },
    });

    await expect(tool.execute({ x: "hello" })).resolves.toEqual({
      error: "Unexpected error.",
    });
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
      expect(result).toEqual({ ok: true });
    });
  });
});
