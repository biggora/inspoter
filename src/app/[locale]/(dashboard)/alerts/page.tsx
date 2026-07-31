import { requireAuth } from "@/lib/auth/dal";
import { AlertsView } from "@/components/alerts/alerts-view";
import { alertDateSchema } from "@/lib/validation/alerts";

export const dynamic = "force-dynamic";

interface AlertsPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AlertsPage({ searchParams }: AlertsPageProps) {
  await requireAuth();
  const { date } = await searchParams;
  const parsedDate = alertDateSchema.safeParse(date);
  return <AlertsView initialDate={parsedDate.success ? parsedDate.data : ""} />;
}
