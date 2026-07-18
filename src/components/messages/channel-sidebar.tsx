"use client";

import { useId, useRef } from "react";
import {
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
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
  const instanceId = useId();
  const channelActionTriggers = useRef(new Map<string, HTMLButtonElement>());

  return (
    <nav className="flex h-full flex-col" aria-label="Каналы сообщений">
      <div className="border-b border-background-100 px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground-900">
          Каналы
        </h2>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {categories.length === 0 ? (
          <EmptyState
            size="xs"
            align="start"
            bordered={false}
            description="Категорий пока нет."
            className="px-2 py-4"
          />
        ) : (
          categories.map((category) => {
            const isCollapsed = collapsedCategories.has(category.id);
            const channelListId = `${instanceId}-${category.id}-channels`;
            return (
              <div key={category.id} className="group/category">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleCategory(category.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={channelListId}
                    className="min-w-0 flex-1 justify-start"
                  >
                    <ChevronDown
                      data-icon="inline-start"
                      className={cn(
                        "text-foreground-400 transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-[11px] font-semibold tracking-wide text-foreground-500 uppercase">
                      {category.name}
                    </span>
                  </Button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity group-hover/category:opacity-100 group-focus-within/category:opacity-100 lg:opacity-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Новый канал в «${category.name}»`}
                      onClick={() => onNewChannel(category.id)}
                    >
                      <Plus aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Переименовать «${category.name}»`}
                      onClick={() => onEditCategory(category)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Удалить «${category.name}»`}
                      onClick={() => onDeleteCategory(category)}
                    >
                      <Trash2 aria-hidden />
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
                      description="Нет каналов"
                      className="px-3 py-1"
                    />
                  ) : (
                    category.channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="group/channel flex items-center gap-1 rounded-md focus-within:bg-background-100/60"
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
                          <span className="shrink-0 text-base font-medium text-foreground-400">
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
                                className="mr-1 opacity-100 transition-opacity group-hover/channel:opacity-100 group-focus-within/channel:opacity-100 lg:opacity-0"
                                aria-label={`Действия канала «${channel.name}»`}
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
                            <MoreHorizontal aria-hidden />
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
                              <Settings aria-hidden />
                              Настройки канала
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEditChannel(channel)}
                            >
                              <Pencil aria-hidden />
                              Переименовать
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onDeleteChannel(channel)}
                            >
                              <Trash2 aria-hidden />
                              Удалить
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
          <Plus aria-hidden data-icon="inline-start" />
          Новая категория
        </Button>
      </div>
    </nav>
  );
}
