import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { MarketingHomePage } from "@/components/marketing/marketing-home-page";

export default async function Home() {
  const cookieStore = await cookies();
  if (cookieStore.has("session")) {
    // Dashboards is the workspace overview and the first sidebar section, so a
    // signed-in operator lands there. /dashboards itself forwards to the start
    // dashboard, or shows the "create your first one" state.
    redirect({ href: "/dashboards", locale: await getLocale() });
  }
  return <MarketingHomePage />;
}
