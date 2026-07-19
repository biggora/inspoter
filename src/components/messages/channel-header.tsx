"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { ChannelDto } from "./api";

interface ChannelHeaderProps {
  channel: ChannelDto;
  categoryName?: string;
  onOpenNavigation: () => void;
  onOpenSettings: (opener: HTMLButtonElement) => void;
}

export function ChannelHeader({
  channel,
  categoryName,
  onOpenNavigation,
  onOpenSettings,
}: ChannelHeaderProps) {
  return (
    <header className="flex min-w-0 shrink-0 items-center gap-2 border-b border-background-100 px-3 py-2.5 sm:px-5 sm:py-3">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        aria-label="Открыть каналы"
        onClick={onOpenNavigation}
      >
        <Icon name="ri-menu-line" aria-hidden />
      </Button>
      <span className="text-lg font-semibold text-foreground-400" aria-hidden>
        #
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-sm font-semibold text-foreground-900">
          {channel.name}
        </h2>
      </div>
      {categoryName && (
        <span className="hidden shrink-0 rounded-full bg-background-100 px-2 py-0.5 text-[10px] tracking-wide text-foreground-400 uppercase sm:inline">
          {categoryName}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Настройки канала «${channel.name}»`}
        onClick={(event) => onOpenSettings(event.currentTarget)}
      >
        <Icon name="ri-settings-3-line" aria-hidden />
      </Button>
    </header>
  );
}
