import { getTranslations } from "next-intl/server";

export async function HelpArticleBody({ slug }: { slug: string }) {
  const t = await getTranslations("help");
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
    </div>
  );
}
