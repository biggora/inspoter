import { Badge } from "@/components/ui/badge";
import {
  isMailLabelHexColor,
  isMailLabelPresetColor,
} from "@/lib/mail-label-color";
import { cn } from "@/lib/utils";
import type { MailLabelDto } from "./api";

const COLOR_VARIANTS = {
  SLATE: "outline",
  RED: "error",
  AMBER: "warning",
  GREEN: "success",
  BLUE: "info",
  VIOLET: "secondary",
} as const;

export interface LabelChipProps {
  label: Pick<MailLabelDto, "name" | "color">;
  className?: string;
}

export function LabelChip({ label, className }: LabelChipProps) {
  const customColor = isMailLabelHexColor(label.color)
    ? label.color.toUpperCase()
    : null;
  const customTextColor = customColor
    ? readableTextColor(customColor)
    : undefined;
  const variant = isMailLabelPresetColor(label.color)
    ? COLOR_VARIANTS[label.color]
    : "outline";

  return (
    <Badge
      variant={variant}
      role="group"
      aria-label={label.name}
      title={label.name}
      className={cn("max-w-28", className)}
      style={
        customColor
          ? {
              backgroundColor: customColor,
              borderColor: customColor,
              color: customTextColor,
            }
          : undefined
      }
    >
      <span aria-hidden className="truncate">
        {label.name}
      </span>
    </Badge>
  );
}

function readableTextColor(hexColor: string): "#000000" | "#FFFFFF" {
  const channels = [1, 3, 5].map((offset) => {
    const channel =
      Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}
