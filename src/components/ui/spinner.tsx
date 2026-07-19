import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <Icon
      name="ri-loader-4-line"
      data-slot="spinner"
      aria-hidden={false}
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
