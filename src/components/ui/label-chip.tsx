import { Badge } from "@/components/ui/badge";
import {
  labelColorToHex,
  readableLabelTextColor,
  type LabelColor,
} from "@/lib/label-color";
import { cn } from "@/lib/utils";

export interface LabelChipProps {
  label: { name: string; color: LabelColor };
  className?: string;
}

export function LabelChip({ label, className }: LabelChipProps) {
  const color = labelColorToHex(label.color);

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
        color: readableLabelTextColor(label.color),
      }}
    >
      <span aria-hidden className="truncate">
        {label.name}
      </span>
    </Badge>
  );
}
