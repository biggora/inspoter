"use client";

import Link from "next/link";
import { useFormatter } from "next-intl";

import type { MessageEmbedDto } from "./api";

// Renders a Discord embed card (specs/discord-webhook-compatibility.md §3.1).
// Everything here is sender-supplied data: only http(s) URLs become links (and
// they carry rel="noopener noreferrer"), and images are plain <img> against
// arbitrary external hosts — the trade-off bookmark-icon.tsx already documents.

const DEFAULT_COLOR = "var(--color-background-300, #99aab5)";

function colorToCss(color: number | undefined): string {
  if (typeof color !== "number" || !Number.isFinite(color)) {
    return DEFAULT_COLOR;
  }
  const clamped = Math.max(0, Math.min(0xffffff, Math.trunc(color)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

function isSafeUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function EmbedLink({ href, children }: { href?: string; children: string }) {
  if (!isSafeUrl(href)) return <>{children}</>;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-600 hover:underline"
    >
      {children}
    </Link>
  );
}

export function MessageEmbed({ embed }: { embed: MessageEmbedDto }) {
  const format = useFormatter();
  const timestamp = embed.timestamp ? new Date(embed.timestamp) : null;
  const validTimestamp =
    timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null;

  return (
    <div
      className="mt-1.5 max-w-xl overflow-hidden rounded-md border border-background-200 bg-background-50"
      data-testid="message-embed"
    >
      <div className="flex">
        <div
          className="w-1 shrink-0"
          style={{ backgroundColor: colorToCss(embed.color) }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5 px-3 py-2.5">
          {embed.author?.name && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-700">
              {isSafeUrl(embed.author.icon_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={embed.author.icon_url}
                  alt=""
                  className="size-4 rounded-full object-cover"
                />
              )}
              <EmbedLink href={embed.author.url}>{embed.author.name}</EmbedLink>
            </div>
          )}

          {embed.title && (
            <p className="text-sm font-semibold text-foreground-900">
              <EmbedLink href={embed.url}>{embed.title}</EmbedLink>
            </p>
          )}

          {embed.description && (
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground-700">
              {embed.description}
            </p>
          )}

          {embed.fields && embed.fields.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-0.5">
              {embed.fields.map((field, index) => (
                <div
                  key={`${field.name}-${index}`}
                  className={
                    field.inline ? "min-w-[8rem] flex-1" : "w-full basis-full"
                  }
                >
                  <p className="text-xs font-semibold text-foreground-900">
                    {field.name}
                  </p>
                  <p className="text-xs break-words whitespace-pre-wrap text-foreground-700">
                    {field.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {isSafeUrl(embed.image?.url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={embed.image.url}
              alt=""
              className="mt-1 max-h-72 w-full rounded object-cover"
            />
          )}

          {(embed.footer?.text || validTimestamp) && (
            <div className="flex items-center gap-1.5 pt-0.5 text-xs text-foreground-400">
              {isSafeUrl(embed.footer?.icon_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={embed.footer.icon_url}
                  alt=""
                  className="size-3.5 rounded-full object-cover"
                />
              )}
              {embed.footer?.text && <span>{embed.footer.text}</span>}
              {embed.footer?.text && validTimestamp && <span>·</span>}
              {validTimestamp && (
                <time dateTime={validTimestamp.toISOString()}>
                  {format.dateTime(validTimestamp, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageEmbeds({
  embeds,
}: {
  embeds: MessageEmbedDto[] | null;
}) {
  if (!embeds || embeds.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {embeds.map((embed, index) => (
        <MessageEmbed key={index} embed={embed} />
      ))}
    </div>
  );
}

// The thumbnail slot is intentionally not rendered: Discord floats it right of
// the description, which fights the dashboard's single-column message layout.
