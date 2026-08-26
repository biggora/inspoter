import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { MarketingHomePage } from "@/components/marketing/marketing-home-page";

export default async function Home() {
  const cookieStore = await cookies();
  if (cookieStore.has("session")) {
    redirect({ href: "/management", locale: await getLocale() });
  }
  return <MarketingHomePage />;
}
