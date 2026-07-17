import type { LucideIcon } from "lucide-react";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";

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
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-24 text-center">
        <Icon aria-hidden className="size-12 text-(--text-muted)" />
        <h2 className="text-lg font-semibold text-foreground">
          {section} — coming soon
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </PageBody>
  );
}
