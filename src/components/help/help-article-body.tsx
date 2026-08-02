import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { HelpArticle } from "@/components/help/help-articles";
import { Link } from "@/i18n/navigation";

// Cross-links used by the webhook paragraphs. Rendered through `t.rich`, so
// the sentence order stays translatable.
const settingsLinks = {
  tokens: (chunks: ReactNode) => (
    <Link href="/settings/webhooks" className="underline">
      {chunks}
    </Link>
  ),
  apiDocs: (chunks: ReactNode) => (
    <Link href="/settings/api-docs" className="underline">
      {chunks}
    </Link>
  ),
  outgoing: (chunks: ReactNode) => (
    <Link href="/settings/outgoing-webhooks" className="underline">
      {chunks}
    </Link>
  ),
};

export async function HelpArticleBody({ article }: { article: HelpArticle }) {
  const t = await getTranslations("help");
  const { slug, webhook, outgoing } = article;
  const steps = t.raw(`${slug}Steps`) as string[];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>{t(`${slug}IntroP1`)}</p>
        <p>{t(`${slug}IntroP2`)}</p>
      </div>
      <div>
        <h2 className="mb-2 text-base font-semibold text-foreground">
          {t("howToUseHeading")}
        </h2>
        <ol className="flex list-inside list-decimal flex-col gap-2 text-sm text-muted-foreground">
          {steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </div>
      {webhook && (
        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            {t("webhookHeading")}
          </h2>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>{t.rich(`${slug}WebhookIntro`, settingsLinks)}</p>
            <p>
              <code className="rounded-sm bg-background-100 px-1.5 py-0.5 font-mono text-xs text-foreground">
                {webhook.endpoint}
              </code>
            </p>
            {webhook.curl && (
              <>
                <pre
                  className="w-full overflow-x-auto rounded-md bg-background-100 p-4 text-left text-xs"
                  tabIndex={0}
                  role="region"
                  aria-label={t("webhookExampleLabel")}
                >
                  {webhook.curl}
                </pre>
                <ul className="flex list-inside list-disc flex-col gap-2">
                  {(t.raw(`${slug}WebhookFields`) as string[]).map(
                    (field, index) => (
                      <li key={index}>{field}</li>
                    ),
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
      {outgoing && (
        <div>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            {t("outgoingWebhookHeading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t.rich(`${slug}OutgoingWebhook`, settingsLinks)}
          </p>
        </div>
      )}
    </div>
  );
}
