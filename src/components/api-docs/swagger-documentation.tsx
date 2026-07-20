"use client";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

interface SwaggerDocumentationProps {
  spec: Record<string, unknown>;
}

export function SwaggerDocumentation({ spec }: SwaggerDocumentationProps) {
  const safeSwaggerConfig = {
    spec,
    supportedSubmitMethods: ["post"] satisfies Array<"post">,
    persistAuthorization: false,
    queryConfigEnabled: false,
    validatorUrl: null,
    displayRequestDuration: true,
  };

  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-background-200 bg-white text-black">
      <SwaggerUI {...safeSwaggerConfig} />
    </div>
  );
}
