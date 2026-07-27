import { requireAuth } from "@/lib/auth/dal";
import * as servicesService from "@/lib/services/services";
import * as serviceLabelsService from "@/lib/services/service-labels";
import { ServicesView } from "@/components/services/services-view";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const { workspace } = await requireAuth();
  const [services, labels] = await Promise.all([
    servicesService.listOverview(workspace.id),
    serviceLabelsService.listLabels(workspace.id),
  ]);
  return <ServicesView initialServices={services} initialLabels={labels} />;
}
