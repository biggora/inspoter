import { cn } from "@/lib/utils";

interface NotificationToastProps {
  message: string;
  variant: "success" | "error";
}

export function NotificationToast({ message, variant }: NotificationToastProps) {
  return (
    <div
      data-slot="notification-toast"
      className={cn(
        "animate-in fade-in-0 slide-in-from-right-4 fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium duration-200",
        variant === "success"
          ? "bg-accent-100/90 text-accent-800"
          : "bg-primary-100/90 text-primary-800",
      )}
      role="status"
      aria-live="polite"
    >
      <i
        className={cn(
          variant === "success" ? "ri-check-line" : "ri-error-warning-line",
          "text-base",
        )}
        aria-hidden
      />
      {message}
    </div>
  );
}
