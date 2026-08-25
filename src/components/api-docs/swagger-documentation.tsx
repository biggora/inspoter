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
// nesting a second main landmark inside the dashboard layout's own <main>.
// No bundle option suppresses it, so the element is swapped for a plain div
// that keeps the id (deep links target it) and every other attribute. The
// initial render may complete after createSwaggerUI returns, hence the
// observer; the swap itself is idempotent, and the caller disconnects the
// observer on re-render and unmount.
function normalizeOperationsLandmark(
  container: HTMLElement,
): MutationObserver | null {
  const replaceMain = (): boolean => {
    const main = container.querySelector("main#operations");
    if (!main) return false;
    const replacement = document.createElement("div");
    for (const attribute of Array.from(main.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    replacement.append(...main.childNodes);
    main.replaceWith(replacement);
    return true;
  };

  if (replaceMain()) return null;

  const observer = new MutationObserver(() => {
    if (replaceMain()) observer.disconnect();
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
      operationsObserver.current = normalizeOperationsLandmark(container);
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
    <div className="min-w-0 overflow-x-auto rounded-lg border border-background-200 bg-white text-black">
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
