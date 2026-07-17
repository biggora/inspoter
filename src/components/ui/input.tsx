import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default" | "lg";
};

function Input({ className, type, size = "default", ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "h-[var(--control-md)] w-full min-w-0 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--text-placeholder)] focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-0 focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=lg]:h-[var(--control-lg)] data-[size=sm]:h-[var(--control-sm)] md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input, type InputProps };
