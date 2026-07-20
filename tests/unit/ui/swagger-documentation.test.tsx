// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const swaggerMock = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockSwaggerUI(props: Record<string, unknown>) {
      swaggerMock.props = props;
      return <div data-testid="swagger-ui" />;
    },
}));

import { SwaggerDocumentation } from "@/components/api-docs/swagger-documentation";

describe("SwaggerDocumentation", () => {
  beforeEach(() => {
    swaggerMock.props = undefined;
  });

  it("renders the server-supplied spec with the locked safe configuration", () => {
    const spec = {
      openapi: "3.1.1",
      paths: { "/api/webhooks/{type}": { post: {} } },
    };

    render(<SwaggerDocumentation spec={spec} />);

    expect(screen.getByTestId("swagger-ui")).toBeInTheDocument();
    expect(swaggerMock.props).toEqual({
      spec,
      supportedSubmitMethods: ["post"],
      persistAuthorization: false,
      queryConfigEnabled: false,
      validatorUrl: null,
      displayRequestDuration: true,
    });
    expect(swaggerMock.props).not.toHaveProperty("url");
    expect(swaggerMock.props).not.toHaveProperty("configUrl");
  });

  it("does not import the specification or add workspace headers client-side", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/api-docs/swagger-documentation.tsx",
      ),
      "utf8",
    );

    expect(source).not.toContain("openapi.json");
    expect(source).not.toContain("X-Inspoter-Workspace");
    expect(source).not.toContain("requestInterceptor");
  });
});
