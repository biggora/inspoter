import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export function FeatureDeepDive({
  title,
  headline,
  description,
  bullets,
  visual,
  reverse = false,
}: {
  title: string;
  headline: string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="px-6 py-24">
      <div
        className={cn(
          "mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row lg:gap-16",
          reverse && "lg:flex-row-reverse",
        )}
      >
        <div className="flex-1 space-y-6">
          <span className="text-sm font-medium uppercase tracking-wider text-primary-400">
            {title}
          </span>
          <h2 className="font-heading text-3xl font-bold text-foreground-50">
            {headline}
          </h2>
          <p className="leading-relaxed text-foreground-400">{description}</p>
          <ul className="space-y-3">
            {bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-3 text-foreground-300"
              >
                <Icon
                  name="ri-check-line"
                  className="mt-0.5 shrink-0 text-accent-400"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1">{visual}</div>
      </div>
    </section>
  );
}
