import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import * as servicesService from "@/lib/services/services";
import { ServiceDetailView } from "@/components/services/service-detail-view";

export const dynamic = "force-dynamic";

interface ServiceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ServiceDetailPage({
  params,
}: ServiceDetailPageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;
  const service = await servicesService.get(id, workspace.id);
  if (!service) notFound();
  return <ServiceDetailView initialService={service} />;
}
