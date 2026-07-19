import { requireAuth } from "@/lib/auth/dal";
import * as servicesService from "@/lib/services/services";
import { ServicesView } from "@/components/services/services-view";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const { workspace } = await requireAuth();
  const services = await servicesService.list(workspace.id);
  return <ServicesView initialServices={services} />;
}
