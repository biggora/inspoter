"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import { Link } from "@/i18n/navigation";
import type {
  YoutubeChannelSnapshot,
  YoutubeVideoTile,
} from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// The latest videos of one YouTube channel, each a link that opens the video on
// YouTube in a new tab — there is no embedded player.
//
// bookmarks-widget deliberately loads no remote images, because a board full of
// operator-supplied favicons would reach out to a dozen third-party hosts. This
// widget does load them: every thumbnail comes from one known host
// (i.ytimg.com) that the operator explicitly asked for by adding the channel,
// and `showThumbnails` turns them off for anyone who would rather not.

function Thumbnail({ src }: { src: string }) {
  // A thumbnail that fails to load (deleted video, blocked host) falls back to a
  // neutral box, never a broken-image glyph.
  const [failed, setFailed] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setFailed(false);
  }

  const frame = "aspect-video w-28 shrink-0 rounded @[28rem]/widget:w-full";

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center bg-[var(--surface-hover)] text-muted-foreground ${frame}`}
      >
        <Icon name="ri-youtube-line" />
      </span>
    );
  }

  // Remote host with no remotePatterns configured; next/image would need
  // per-host config in next.config.ts. `alt` is empty because the video title
  // sits next to the thumbnail inside the same link.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`object-cover ${frame}`}
      onError={() => setFailed(true)}
    />
  );
}

function VideoRow({
  video,
  showThumbnail,
}: {
  video: YoutubeVideoTile;
  showThumbnail: boolean;
}) {
  const relativeTime = useWidgetRelativeTime();

  return (
    <Link
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 gap-2 rounded-md px-1 py-0.5 -mx-1 text-xs no-underline transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 @[28rem]/widget:flex-col"
    >
      {showThumbnail && <Thumbnail src={video.thumbnailUrl} />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 font-medium text-foreground-900">
          {video.title}
        </span>
        {video.publishedAt && (
          <span className="text-muted-foreground">
            {relativeTime(video.publishedAt)}
          </span>
        )}
      </span>
    </Link>
  );
}

export function YoutubeWidget({
  data,
}: {
  data: YoutubeChannelSnapshot | null;
}) {
  const t = useTranslations("dashboards");

  // No channel yet — say what to do rather than showing an error.
  if (data === null) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("youtube.notConfigured")}
      </p>
    );
  }

  if (data.videos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("youtube.empty")}</p>
    );
  }

  const hidden = data.totalCount - data.videos.length;

  return (
    <div className="flex h-full flex-col gap-2">
      <ul className="grid grid-cols-1 gap-1.5 @[28rem]/widget:grid-cols-2 @[28rem]/widget:gap-2">
        {data.videos.map((video) => (
          <li key={video.id} className="min-w-0">
            <VideoRow video={video} showThumbnail={data.showThumbnails} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("youtube.moreCount", { count: hidden })}
        </p>
      )}
      {data.channelUrl && (
        <Link
          href={data.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate rounded-md text-xs text-muted-foreground hover:text-foreground-900 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          {data.channelTitle || t("youtube.openChannel")}
        </Link>
      )}
    </div>
  );
}
