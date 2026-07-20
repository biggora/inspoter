"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ChannelDto, MessageCategoryDto } from "./api";

export interface ChannelSidebarProps {
  categories: MessageCategoryDto[];
  selectedChannelId: string | null;
  collapsedCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onNewCategory: () => void;
  onEditCategory: (category: MessageCategoryDto) => void;
  onDeleteCategory: (category: MessageCategoryDto) => void;
  onNewChannel: (categoryId: string) => void;
  onOpenChannelSettings: (channel: ChannelDto, opener: HTMLElement) => void;
  onEditChannel: (channel: ChannelDto) => void;
  onDeleteChannel: (channel: ChannelDto) => void;
}

export function ChannelSidebar({
  categories,
  selectedChannelId,
  collapsedCategories,
  onToggleCategory,
  onSelectChannel,
  onNewCategory,
  onEditCategory,
  onDeleteCategory,
  onNewChannel,
  onOpenChannelSettings,
  onEditChannel,
  onDeleteChannel,
}: ChannelSidebarProps) {
  const t = useTranslations("messages");
  const instanceId = useId();
  const channelActionTriggers = useRef(new Map<string, HTMLButtonElement>());

  return (
    <nav className="flex h-full flex-col" aria-label={t("sidebarNavLabel")}>
      <div className="border-b border-background-100 px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground-900">
          {t("channelsHeading")}
        </h2>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {categories.length === 0 ? (
          <EmptyState
            size="xs"
            align="start"
            bordered={false}
            description={t("noCategoriesSidebarText")}
            className="py-4 pr-2 pl-[26px]"
          />
        ) : (
          categories.map((category) => {
            const isCollapsed = collapsedCategories.has(category.id);
            const channelListId = `${instanceId}-${category.id}-channels`;
            return (
              <div key={category.id} className="group/category">
                <div className="flex items-center gap-1 rounded-[var(--radius-lg)] py-1.5 hover:bg-[var(--surface-hover)] focus-within:bg-[var(--surface-hover)]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleCategory(category.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={channelListId}
                    className="min-w-0 flex-1 justify-start"
                  >
                    <Icon
                      name="ri-arrow-down-s-line"
                      data-icon="inline-start"
                      className={cn(
                        "w-4 shrink-0 text-foreground-400 transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-[11px] font-semibold tracking-wide text-foreground-500 uppercase">
                      {category.name}
                    </span>
                  </Button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/category:opacity-100 lg:group-focus-within/category:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("newChannelInCategoryLabel", {
                        name: category.name,
                      })}
                      onClick={() => onNewChannel(category.id)}
                    >
                      <Icon name="ri-add-line" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("renameCategoryLabel", {
                        name: category.name,
                      })}
                      onClick={() => onEditCategory(category)}
                    >
                      <Icon name="ri-edit-line" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("deleteCategoryLabel", {
                        name: category.name,
                      })}
                      onClick={() => onDeleteCategory(category)}
                    >
                      <Icon name="ri-delete-bin-line" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div
                  id={channelListId}
                  hidden={isCollapsed}
                  className={cn(
                    "flex flex-col gap-0.5",
                    isCollapsed && "hidden",
                  )}
                >
                  {category.channels.length === 0 ? (
                    <EmptyState
                      size="xs"
                      align="start"
                      bordered={false}
                      description={t("noChannelsText")}
                      className="py-1 pr-2 pl-[26px]"
                    />
                  ) : (
                    category.channels.map((channel) => (
                      <div
                        key={channel.id}
                        className={cn(
                          "group/channel flex items-center gap-1 rounded-[var(--radius-lg)] focus-within:bg-[var(--surface-hover)]",
                          channel.id === selectedChannelId
                            ? "bg-[oklch(var(--secondary-100))] hover:bg-[oklch(var(--secondary-200))]"
                            : "hover:bg-[var(--surface-hover)]",
                        )}
                      >
                        <Button
                          type="button"
                          variant={
                            channel.id === selectedChannelId
                              ? "secondary"
                              : "ghost"
                          }
                          size="sm"
                          onClick={() => onSelectChannel(channel.id)}
                          title={channel.name}
                          aria-current={
                            channel.id === selectedChannelId
                              ? "page"
                              : undefined
                          }
                          className="min-w-0 flex-1 justify-start"
                        >
                          <span
                            data-icon="inline-start"
                            aria-hidden
                            className="inline-flex w-4 shrink-0 items-center justify-center text-base font-medium text-foreground-400"
                          >
                            #
                          </span>
                          <span className="truncate">{channel.name}</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="mr-1 opacity-100 transition-opacity hover:bg-transparent aria-expanded:bg-transparent lg:opacity-0 lg:group-hover/channel:opacity-100 lg:group-focus-within/channel:opacity-100"
                                aria-label={t("channelActionsLabel", {
                                  name: channel.name,
                                })}
                                ref={(element) => {
                                  if (element) {
                                    channelActionTriggers.current.set(
                                      channel.id,
                                      element,
                                    );
                                  } else {
                                    channelActionTriggers.current.delete(
                                      channel.id,
                                    );
                                  }
                                }}
                              />
                            }
                          >
                            <Icon name="ri-more-line" aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={(event) =>
                                onOpenChannelSettings(
                                  channel,
                                  channelActionTriggers.current.get(
                                    channel.id,
                                  ) ?? event.currentTarget,
                                )
                              }
                            >
                              <Icon name="ri-settings-3-line" aria-hidden />
                              {t("channelSettingsMenuItem")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEditChannel(channel)}
                            >
                              <Icon name="ri-edit-line" aria-hidden />
                              {t("renameMenuItem")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onDeleteChannel(channel)}
                            >
                              <Icon name="ri-delete-bin-line" aria-hidden />
                              {t("deleteMenuItem")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-background-100 p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onNewCategory}
          className="w-full justify-start"
        >
          <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
          {t("newCategoryButton")}
        </Button>
      </div>
    </nav>
  );
}
