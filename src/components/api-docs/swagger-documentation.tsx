"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const SWAGGER_UI_SCRIPT = "/vendor/swagger-ui/5.32.9/swagger-ui-bundle.js";

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

export function SwaggerDocumentation({
  spec,
  runtimeErrors,
}: SwaggerDocumentationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
