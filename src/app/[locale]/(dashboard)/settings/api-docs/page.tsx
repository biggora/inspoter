import { getTranslations } from "next-intl/server";
import publicApiSpec from "../../../../../../specs/openapi.json";
import { SwaggerDocumentation } from "@/components/api-docs/swagger-documentation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function ApiDocsPage() {
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
      <SwaggerDocumentation spec={publicApiSpec} />
    </PageBody>
  );
}
