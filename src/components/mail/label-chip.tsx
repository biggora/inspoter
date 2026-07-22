import { Badge } from "@/components/ui/badge";
import {
  mailLabelColorToHex,
  readableMailLabelTextColor,
} from "@/lib/mail-label-color";
import { cn } from "@/lib/utils";
import type { MailLabelDto } from "./api";

export interface LabelChipProps {
  label: Pick<MailLabelDto, "name" | "color">;
  className?: string;
}

export function LabelChip({ label, className }: LabelChipProps) {
  const color = mailLabelColorToHex(label.color);

  return (
    <Badge
      variant="outline"
      role="group"
      aria-label={label.name}
      title={label.name}
      className={cn("max-w-28", className)}
      style={{
        backgroundColor: color,
        borderColor: color,
        color: readableMailLabelTextColor(label.color),
      }}
    >
      <span aria-hidden className="truncate">
        {label.name}
      </span>
    </Badge>
  );
}
