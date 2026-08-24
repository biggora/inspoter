// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { isWebMcpSupported } from "@/lib/web-mcp/support";
import {
  installMockModelContext,
  uninstallMockModelContext,
} from "./test-utils";

describe("isWebMcpSupported", () => {
  afterEach(() => {
    uninstallMockModelContext();
  });

  it("is false by default in jsdom", () => {
    expect(isWebMcpSupported()).toBe(false);
  });

  it("is true once a mock modelContext is installed", () => {
    installMockModelContext();
    expect(isWebMcpSupported()).toBe(true);
  });

  it("is false again after the mock is uninstalled", () => {
    installMockModelContext();
    expect(isWebMcpSupported()).toBe(true);

    uninstallMockModelContext();
    expect(isWebMcpSupported()).toBe(false);
  });
});
