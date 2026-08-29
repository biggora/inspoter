import type { ReactNode } from "react";
import { useRender } from "@base-ui/react/use-render";

import {
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// The card header every entity list agrees on: a 36px secondary icon tile, a
// truncating title, and one line of description, with optional status actions
// on the right (hosting accounts, servers, services). Extracted from three
// verbatim copies so a new entity card starts aligned instead of re-deriving
// the tile classes.
//
// The tile+title block defaults to a plain `<div>`; pass `render={<Link … />}`
// to make the whole block the card's link target (services) while leaving the
// title-as-link strategy (servers) available by nesting the link in `title`.

export function EntityCardHeader({
  icon,
  title,
  description,
  descriptionClassName,
  action,
  className,
  render,
}: {
  /** Remix Icon class for the entity, e.g. `"ri-server-line"`. */
  icon: string;
  /** Rendered inside `CardTitle > h2.truncate`; may itself be a link. */
  title: ReactNode;
  description?: ReactNode;
  /** Extra classes for the description row (e.g. `"truncate"`). */
  descriptionClassName?: string;
  /** Right-aligned status/actions; rendered in `CardAction` when provided. */
  action?: ReactNode;
  className?: string;
  render?: useRender.RenderProp;
}) {
  const block = useRender<Record<string, unknown>, HTMLDivElement>({
    defaultTagName: "div",
    props: {
      className: "flex min-w-0 items-center gap-2.5",
      children: (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-100">
            <Icon
              name={icon}
              aria-hidden
              className="text-base text-secondary-600"
            />
          </span>
          <div className="min-w-0">
            <CardTitle>
              <h2 className="truncate">{title}</h2>
            </CardTitle>
            {description ? (
              <CardDescription className={cn("text-xs", descriptionClassName)}>
                {description}
              </CardDescription>
            ) : null}
          </div>
        </>
      ),
    },
    render,
  });

  return (
    <CardHeader className={cn("border-b", className)}>
      {block}
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
  );
}
