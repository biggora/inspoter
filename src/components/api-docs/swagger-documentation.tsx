"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const SWAGGER_UI_SCRIPT = "/vendor/swagger-ui/5.32.14/swagger-ui-bundle.js";

interface SwaggerUIBundleConfig {
  spec: Record<string, unknown>;
  domNode: HTMLElement;
  supportedSubmitMethods: ["post"];
  persistAuthorization: false;
  queryConfigEnabled: false;
  validatorUrl: null;
  displayRequestDuration: true;
}

type SwaggerUIBundleFactory = (config: SwaggerUIBundleConfig) => unknown;

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUIBundleFactory;
  }
}

interface SwaggerDocumentationProps {
  spec: Record<string, unknown>;
  runtimeErrors: {
    load: string;
    unavailable: string;
    initialization: string;
  };
}

// The vendored bundle renders its operations list as <main id="operations">,
// nesting a second main landmark inside the dashboard layout's own <main>,
// and its info header as an <h1 class="title">, which duplicates the page
// header's own h1 and skips heading levels down to the operation groups'
// <h3>. No bundle option suppresses either, so both elements are swapped for
// semantic equivalents that keep every other attribute: a plain div that
// keeps the id (deep links target it) and an h2 (the info block styles
// itself through the .title class, so the tag change is purely semantic).
// The initial render may complete after createSwaggerUI returns, hence the
// observer; the swaps themselves are idempotent, and the caller disconnects
// the observer on re-render and unmount.
function normalizeVendoredSemantics(
  container: HTMLElement,
): MutationObserver | null {
  const swapElement = (element: Element, tagName: "div" | "h2"): void => {
    const replacement = document.createElement(tagName);
    for (const attribute of Array.from(element.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    replacement.append(...element.childNodes);
    element.replaceWith(replacement);
  };

  // Completion is tracked by the swaps actually performed, not by absence of
  // the targets: right after createSwaggerUI returns the bundle may not have
  // rendered anything yet, and "no main, no h1" at that point means "keep
  // waiting", not "done". If a future specification ever rendered without an
  // info heading, the observer would simply stay connected until the caller
  // disconnects it on re-render or unmount.
  let operationsMainNormalized = false;
  let infoHeadingNormalized = false;

  const applyNormalizations = (): boolean => {
    const operationsMain = container.querySelector("main#operations");
    if (operationsMain) {
      swapElement(operationsMain, "div");
      operationsMainNormalized = true;
    }

    const infoHeading = container.querySelector("h1");
    if (infoHeading) {
      swapElement(infoHeading, "h2");
      infoHeadingNormalized = true;
    }

    return operationsMainNormalized && infoHeadingNormalized;
  };

  if (applyNormalizations()) return null;

  const observer = new MutationObserver(() => {
    if (applyNormalizations()) observer.disconnect();
  });
  observer.observe(container, { childList: true, subtree: true });
  return observer;
}

export function SwaggerDocumentation({
  spec,
  runtimeErrors,
}: SwaggerDocumentationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const operationsObserver = useRef<MutationObserver | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleScriptReady = useCallback(() => {
    const container = containerRef.current;
    const createSwaggerUI = window.SwaggerUIBundle;

    if (!container || typeof createSwaggerUI !== "function") {
      setRuntimeStatus("error");
      setErrorMessage(runtimeErrors.unavailable);
      return;
    }

    operationsObserver.current?.disconnect();
    operationsObserver.current = null;
    container.replaceChildren();

    try {
      createSwaggerUI({
        spec,
        domNode: container,
        supportedSubmitMethods: ["post"],
        persistAuthorization: false,
        queryConfigEnabled: false,
        validatorUrl: null,
        displayRequestDuration: true,
      });
      operationsObserver.current = normalizeVendoredSemantics(container);
      setRuntimeStatus("ready");
      setErrorMessage(null);
    } catch {
      setRuntimeStatus("error");
      setErrorMessage(runtimeErrors.initialization);
    }
  }, [runtimeErrors, spec]);

  const handleScriptError = useCallback(() => {
    setRuntimeStatus("error");
    setErrorMessage(runtimeErrors.load);
  }, [runtimeErrors.load]);

  useEffect(() => {
    const container = containerRef.current;

    return () => {
      operationsObserver.current?.disconnect();
      operationsObserver.current = null;
      container?.replaceChildren();
    };
  }, []);

  return (
    <div
      data-slot="swagger-documentation"
      className="min-w-0 overflow-x-auto rounded-lg border border-background-200 bg-card text-card-foreground"
    >
      <Script
        src={SWAGGER_UI_SCRIPT}
        strategy="afterInteractive"
        onReady={handleScriptReady}
        onError={handleScriptError}
      />
      {errorMessage ? (
        <p role="alert" className="p-4 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <div ref={containerRef} aria-busy={runtimeStatus === "loading"} />
    </div>
  );
}
