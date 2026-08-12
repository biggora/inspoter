import { getInitials, stringToColor } from "@/lib/mail/avatar";
import { cn } from "@/lib/utils";

// A contact's photo when it has one, the same deterministic initials tile the
// mail client draws when it does not. The photo is served from
// /api/contacts/[id]/photo, which is workspace-scoped and revalidated by ETag,
// so listing 50 contacts costs 50 conditional requests at most once.

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-20 text-xl",
} as const;

export interface ContactAvatarProps {
  contactId: string;
  displayName: string;
  hasPhoto: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}

export function ContactAvatar({
  contactId,
  displayName,
  hasPhoto,
  size = "md",
  className,
}: ContactAvatarProps) {
  const classes = cn(
    "flex shrink-0 items-center justify-center rounded-full font-medium",
    SIZES[size],
    className,
  );

  if (hasPhoto) {
    // A plain <img>: the bytes come from an authenticated, workspace-scoped
    // route that next/image cannot optimize and would only proxy, and the
    // avatar is at most 80px so there is nothing to optimize anyway.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/contacts/${contactId}/photo`}
        alt=""
        className={cn(classes, "object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(classes, "text-white")}
      style={{ backgroundColor: stringToColor(displayName || contactId) }}
    >
      {getInitials(displayName)}
    </span>
  );
}
