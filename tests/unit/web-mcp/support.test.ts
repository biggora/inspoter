// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { getModelContexts, isWebMcpSupported } from "@/lib/web-mcp/support";
import {
  createMockModelContext,
  defineModelContext,
  installMockModelContext,
  uninstallMockModelContext,
} from "./test-utils";

describe("isWebMcpSupported", () => {
  afterEach(() => {
    uninstallMockModelContext();
  });

  it("is false when neither surface exposes modelContext", () => {
    expect(isWebMcpSupported()).toBe(false);
  });

  it("is true with only document.modelContext (W3C draft surface)", () => {
    installMockModelContext({ surface: "document" });
    expect(isWebMcpSupported()).toBe(true);
  });

  it("is true with only navigator.modelContext (shipping Chrome surface)", () => {
    installMockModelContext({ surface: "navigator" });
    expect(isWebMcpSupported()).toBe(true);
  });

  it("is false again after the mock is uninstalled", () => {
    installMockModelContext({ surface: "both" });
    expect(isWebMcpSupported()).toBe(true);

    uninstallMockModelContext();
    expect(isWebMcpSupported()).toBe(false);
  });
});

describe("getModelContexts", () => {
  afterEach(() => {
    uninstallMockModelContext();
  });

  it("returns nothing when neither surface exists", () => {
    expect(getModelContexts()).toEqual([]);
  });

  it("returns exactly one entry when only document exposes it", () => {
    const mock = installMockModelContext({ surface: "document" });
    expect(getModelContexts()).toEqual([mock]);
  });

  it("returns exactly one entry when only navigator exposes it", () => {
    const mock = installMockModelContext({ surface: "navigator" });
    expect(getModelContexts()).toEqual([mock]);
  });

  it("returns both entries, document first, when the surfaces are distinct", () => {
    const mocks = installMockModelContext({ surface: "both" });

    const contexts = getModelContexts();

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(mocks.document);
    expect(contexts[1]).toBe(mocks.navigator);
  });

  it("deduplicates when both globals alias the same object", () => {
    // A browser keeping `navigator.modelContext` as a pointer to the
    // canonical one — registering twice would fail with InvalidStateError.
    const shared = createMockModelContext();
    defineModelContext(document, shared);
    defineModelContext(navigator, shared);

    const contexts = getModelContexts();

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toBe(shared);
  });
});
