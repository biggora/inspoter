import { cn } from "@/lib/utils";

export function TerminalWindow({
  title = "Terminal",
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-foreground-800/30 bg-background-950",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-foreground-800/20 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="flex-1 text-center font-mono text-xs text-foreground-500">
          {title}
        </span>
      </div>
      <div className="p-4 font-mono text-sm text-foreground-300">
        {children}
      </div>
    </div>
  );
}
