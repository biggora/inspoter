import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

interface SectionPlaceholderProps {
  section: string;
  description: string;
  /** Remix Icon class name (e.g. `"ri-inbox-line"`). */
  icon: string;
}

export function SectionPlaceholder({
  section,
  description,
  icon,
}: SectionPlaceholderProps) {
  return (
    <PageBody>
      <PageHeader title={section} />
      <EmptyState
        icon={icon}
        title={`${section} — coming soon`}
        description={description}
      />
    </PageBody>
  );
}
