import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getHelpArticle } from "@/components/help/help-articles";
import { HelpArticleBody } from "@/components/help/help-article-body";
import { requireAuth } from "@/lib/auth/dal";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";

export const dynamic = "force-dynamic";

interface HelpArticlePageProps {
  params: Promise<{ article: string }>;
}

export default async function HelpArticlePage({
  params,
}: HelpArticlePageProps) {
  await requireAuth();
  const { article: slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  const t = await getTranslations("help");

  return (
    <PageBody>
      <PageHeader
        title={t(article.titleKey)}
        back={{ href: "/help", label: t("backToHelp") }}
      />
      <HelpArticleBody article={article} />
    </PageBody>
  );
}
