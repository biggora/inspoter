import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/dal";
import * as servicesService from "@/lib/services/services";
import * as serviceLabelsService from "@/lib/services/service-labels";
import { ServiceDetailView } from "@/components/services/service-detail-view";
import { SERVICES_LIST_PARAMS } from "@/components/services/list-params";
import { listHref, pickListSearch } from "@/lib/list-search-params";

export const dynamic = "force-dynamic";

interface ServiceDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServiceDetailPage({
  params,
  searchParams,
}: ServiceDetailPageProps) {
  const { workspace } = await requireAuth();
  const { id } = await params;

  // The list's filters ride along in the query string, so "back" lands on the
  // filtered view the operator left rather than on the full list.
  const backHref = listHref(
    "/services",
    pickListSearch(await searchParams, SERVICES_LIST_PARAMS),
  );

  const [service, labels] = await Promise.all([
    servicesService.get(id, workspace.id),
    serviceLabelsService.listLabels(workspace.id),
  ]);
  if (!service) notFound();
  return (
    <ServiceDetailView
      initialService={service}
      labels={labels}
      backHref={backHref}
    />
  );
}
