import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function DashboardNotFound() {
  const t = await getTranslations("ui");

  return (
    <div className="flex min-h-[50vh] items-center justify-center py-12">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">
          {t("notFoundTitle")}
        </h1>
        <p className="mt-3 text-muted-foreground">{t("notFoundDescription")}</p>
        <Link
          href="/dashboards"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {t("notFoundDashboardAction")}
        </Link>
      </div>
    </div>
  );
}
