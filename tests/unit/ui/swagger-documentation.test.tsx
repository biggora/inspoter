// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const swaggerMock = vi.hoisted(() => ({
  loadError: false,
  props: undefined as Record<string, unknown> | undefined,
  scriptSrc: undefined as string | undefined,
}));

vi.mock("next/script", () => ({
  default: function MockScript({
    onError,
    onReady,
    src,
  }: {
    onError?: () => void;
    onReady?: () => void;
    src: string;
  }) {
    swaggerMock.scriptSrc = src;
    useEffect(() => {
      if (swaggerMock.loadError) onError?.();
      else onReady?.();
    }, [onError, onReady]);
    return <div data-testid="swagger-script" data-src={src} />;
  },
}));

import { SwaggerDocumentation } from "@/components/api-docs/swagger-documentation";

const runtimeErrors = {
  load: "Не удалось загрузить тестовый Swagger UI.",
  unavailable: "Тестовый Swagger UI недоступен.",
  initialization: "Не удалось инициализировать тестовую документацию API.",
};

describe("SwaggerDocumentation", () => {
  beforeEach(() => {
    swaggerMock.loadError = false;
    swaggerMock.props = undefined;
    swaggerMock.scriptSrc = undefined;
    window.SwaggerUIBundle = vi.fn((props) => {
      swaggerMock.props = props;
      props.domNode.append(document.createElement("div"));
    });
  });

  it("initializes the pinned same-origin runtime with the locked safe configuration", async () => {
    const spec = {
      openapi: "3.1.1",
      paths: { "/api/webhooks/{type}": { post: {} } },
    };

    render(<SwaggerDocumentation spec={spec} runtimeErrors={runtimeErrors} />);

    await waitFor(() => expect(swaggerMock.props).toBeDefined());
    expect(swaggerMock.scriptSrc).toBe(
      "/vendor/swagger-ui/5.32.9/swagger-ui-bundle.js",
    );
    expect(swaggerMock.props).toEqual({
      spec,
      domNode: expect.any(HTMLDivElement),
      supportedSubmitMethods: ["post"],
      persistAuthorization: false,
      queryConfigEnabled: false,
      validatorUrl: null,
      displayRequestDuration: true,
    });
    expect(swaggerMock.props).not.toHaveProperty("url");
    expect(swaggerMock.props).not.toHaveProperty("configUrl");
  });

  it("clears the owned container when it unmounts", async () => {
    const { unmount } = render(
      <SwaggerDocumentation
        spec={{ openapi: "3.1.1", paths: {} }}
        runtimeErrors={runtimeErrors}
      />,
    );

    await waitFor(() => expect(swaggerMock.props).toBeDefined());
    const container = swaggerMock.props?.domNode;
    if (!(container instanceof HTMLDivElement)) {
      throw new Error("Expected Swagger UI to receive an HTML div container.");
    }
    expect(container.childElementCount).toBe(1);

    unmount();
    expect(container.childElementCount).toBe(0);
  });

  it("shows a semantic error when the local runtime fails to load", async () => {
    swaggerMock.loadError = true;

    render(
      <SwaggerDocumentation
        spec={{ openapi: "3.1.1", paths: {} }}
        runtimeErrors={runtimeErrors}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      runtimeErrors.load,
    );
    expect(window.SwaggerUIBundle).not.toHaveBeenCalled();
  });

  it("uses the supplied message when the runtime global is unavailable", async () => {
    window.SwaggerUIBundle = undefined;

    render(
      <SwaggerDocumentation
        spec={{ openapi: "3.1.1", paths: {} }}
        runtimeErrors={runtimeErrors}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      runtimeErrors.unavailable,
    );
  });

  it("uses the supplied message when runtime initialization throws", async () => {
    window.SwaggerUIBundle = vi.fn(() => {
      throw new Error("Synthetic initialization failure");
    });

    render(
      <SwaggerDocumentation
        spec={{ openapi: "3.1.1", paths: {} }}
        runtimeErrors={runtimeErrors}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      runtimeErrors.initialization,
    );
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
