import type { LucideIcon } from "lucide-react";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

interface SectionPlaceholderProps {
  section: string;
  description: string;
  icon: LucideIcon;
}

export function SectionPlaceholder({
  section,
  description,
  icon: Icon,
}: SectionPlaceholderProps) {
  return (
    <PageBody>
      <PageHeader title={section} />
      <EmptyState
        icon={Icon}
        title={`${section} — coming soon`}
        description={description}
      />
    </PageBody>
  );
}
