"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Icon } from "@/components/ui/icon";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      icons={{
        success: <Icon name="ri-checkbox-circle-line" />,
        info: <Icon name="ri-information-line" />,
        warning: <Icon name="ri-alert-line" />,
        error: <Icon name="ri-spam-line" />,
        loading: <Icon name="ri-loader-4-line" className="animate-spin" />,
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
          toast:
            "cn-toast transition-[transform,height,box-shadow]! [&>*]:transition-none!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
