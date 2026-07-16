"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--feedback-success-bg)",
          "--success-border": "var(--feedback-success-border)",
          "--success-text": "var(--feedback-success-text)",
          "--info-bg": "var(--feedback-info-bg)",
          "--info-border": "var(--feedback-info-border)",
          "--info-text": "var(--feedback-info-text)",
          "--warning-bg": "var(--feedback-warning-bg)",
          "--warning-border": "var(--feedback-warning-border)",
          "--warning-text": "var(--feedback-warning-text)",
          "--error-bg": "var(--feedback-error-bg)",
          "--error-border": "var(--feedback-error-border)",
          "--error-text": "var(--feedback-error-text)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
