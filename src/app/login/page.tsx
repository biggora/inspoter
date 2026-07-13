import { LoginForm } from "./login-form";

// AC-AUTH-002/003 UI (design.md §3.1). Server Component: reads the `next`
// redirect-target query param (proxy.ts sets it; design.md §1.2 deep
// -link preservation) and hands it to the client-side form. No auth check
// here — /login is the one dashboard-adjacent route proxy always
// allows unauthenticated (AC-AUTH-001 exception).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-2xl font-semibold text-foreground">inspot</span>
        <p className="text-sm text-muted-foreground">
          self-hosted operations dashboard
        </p>
      </div>
      <LoginForm next={next} />
    </div>
  );
}
