import type { LucideIcon } from "lucide-react";

interface SectionPlaceholderProps {
  section: string;
  description: string;
  icon: LucideIcon;
}

// AC-SHELL-003 (design.md §3.2.4) — one reusable "coming soon" template
// applied to every not-yet-implemented section (plan.md §5.4 item 4). Route
// resolves at 200 within the authenticated shell; never a 404/blank screen.
export function SectionPlaceholder({
  section,
  description,
  icon: Icon,
}: SectionPlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{section}</h1>
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-24 text-center">
        <Icon aria-hidden className="size-12 text-(--text-muted)" />
        <h2 className="text-lg font-semibold text-foreground">
          {section} — coming soon
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
