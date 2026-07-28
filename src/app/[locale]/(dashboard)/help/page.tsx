import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { HELP_ARTICLES } from "@/components/help/help-articles";
import { CardGrid } from "@/components/shell/card-grid";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  await requireAuth();
  const t = await getTranslations("help");

  return (
    <PageBody>
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <CardGrid columns={2}>
        {HELP_ARTICLES.map((article) => (
          <Link
            key={article.slug}
            href={article.href}
            className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
          >
            <Icon
              name={article.icon}
              className="text-lg text-muted-foreground"
            />
            <div>
              <p className="font-medium">{t(article.titleKey)}</p>
              <p className="text-sm text-muted-foreground">
                {t(article.cardDescriptionKey)}
              </p>
            </div>
          </Link>
        ))}
      </CardGrid>
    </PageBody>
  );
}
