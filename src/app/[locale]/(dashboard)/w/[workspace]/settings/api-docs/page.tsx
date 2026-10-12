import { getTranslations } from "next-intl/server";
import publicApiSpec from "@specs/openapi.json";
import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { SwaggerDocumentation } from "@/components/api-docs/swagger-documentation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function ApiDocsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  // No workspace data here, but the page still resolves the slug so a soft
  // navigation to it records the workspace as last used (OQ-5).
  await requireWorkspaceBySlug((await params).workspace);
  const t = await getTranslations("settings");

  return (
    <PageBody>
      <PageHeader
        title={t("apiDocsTitle")}
        description={t("apiDocsDescription")}
        back={{ href: "/settings", label: t("backToSettings") }}
      />
      <Alert variant="warning">
        <AlertDescription>{t("apiDocsCredentialWarning")}</AlertDescription>
      </Alert>
      <SwaggerDocumentation
        spec={publicApiSpec}
        runtimeErrors={{
          load: t("apiDocsRuntimeLoadError"),
          unavailable: t("apiDocsRuntimeUnavailableError"),
          initialization: t("apiDocsInitializationError"),
        }}
      />
    </PageBody>
  );
}
