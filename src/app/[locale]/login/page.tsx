import { getTranslations } from "next-intl/server";
import { authentikEnabled } from "@/lib/config/env";
import { LoginForm } from "./login-form";

// AC-AUTH-002/003 UI (design.md §3.1). Server Component: reads the `next`
// redirect-target query param (proxy.ts sets it; design.md §1.2 deep
// -link preservation) and hands it to the client-side form. No auth check
// here — /login is the one dashboard-adjacent route proxy always
// allows unauthenticated (AC-AUTH-001 exception). Also reads `error`, set by
// the Authentik callback route on failure (src/app/api/auth/authentik/callback).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-2xl font-semibold text-foreground">Inspoter</span>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
      <LoginForm
        next={next}
        authentikEnabled={authentikEnabled}
        authentikError={error}
      />
    </main>
  );
}
