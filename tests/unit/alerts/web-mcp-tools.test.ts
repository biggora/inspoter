import { describe, expect, it, vi } from "vitest";

import {
  createSetCategoryTool,
  type SetCategoryToolContext,
} from "@/components/alerts/web-mcp-tools";

function makeCtx(overrides: Partial<SetCategoryToolContext> = {}): SetCategoryToolContext {
  return {
    setCategoryBulk: vi.fn().mockResolvedValue({ updated: 2 }),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe("createSetCategoryTool", () => {
  it("calls setCategoryBulk with exactly the given alertIds and categoryId", async () => {
    const ctx = makeCtx();
    const tool = createSetCategoryTool(ctx);

    await tool.execute({
      alertIds: ["alert-1", "alert-2"],
      categoryId: "cat-1",
    });

    expect(ctx.setCategoryBulk).toHaveBeenCalledWith(
      ["alert-1", "alert-2"],
      "cat-1",
    );
  });

  it("supports categoryId: null to clear the category", async () => {
    const ctx = makeCtx();
    const tool = createSetCategoryTool(ctx);

    await tool.execute({ alertIds: ["alert-1"], categoryId: null });

    expect(ctx.setCategoryBulk).toHaveBeenCalledWith(["alert-1"], null);
  });

  it("calls refresh() after setCategoryBulk resolves", async () => {
    const ctx = makeCtx();
    const tool = createSetCategoryTool(ctx);

    await tool.execute({ alertIds: ["alert-1"], categoryId: "cat-1" });

    expect(ctx.refresh).toHaveBeenCalledTimes(1);
  });

  it("returns { updated } from the bulk result", async () => {
    const ctx = makeCtx({
      setCategoryBulk: vi.fn().mockResolvedValue({ updated: 7 }),
    });
    const tool = createSetCategoryTool(ctx);

    const result = await tool.execute({
      alertIds: ["alert-1"],
      categoryId: "cat-1",
    });

    expect(result).toEqual({ updated: 7 });
  });

  it("rejects an empty alertIds array via schema validation, without calling the handler", async () => {
    const ctx = makeCtx();
    const tool = createSetCategoryTool(ctx);

    const result = (await tool.execute({
      alertIds: [],
      categoryId: "cat-1",
    })) as { error: string };

    expect(result.error).toContain("Invalid input");
    expect(ctx.setCategoryBulk).not.toHaveBeenCalled();
  });

  it("rejects more than 50 alertIds via schema validation, without calling the handler", async () => {
    const ctx = makeCtx();
    const tool = createSetCategoryTool(ctx);

    const alertIds = Array.from({ length: 51 }, (_, i) => `alert-${i}`);
    const result = (await tool.execute({
      alertIds,
      categoryId: "cat-1",
    })) as { error: string };

    expect(result.error).toContain("Invalid input");
    expect(ctx.setCategoryBulk).not.toHaveBeenCalled();
  });
});
