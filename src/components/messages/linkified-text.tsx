import Link from "next/link";
import LinkifyIt from "linkify-it";

// Message text is sender-supplied, so only http(s) matches become links, and
// they open in a new tab with rel="noopener noreferrer" like embed links do.

const linkify = new LinkifyIt();

export function LinkifiedText({ text }: { text: string }) {
  const parts = [];
  let offset = 0;
  for (const match of linkify.match(text) ?? []) {
    if (!/^https?:\/\//iu.test(match.url)) continue;
    parts.push(text.slice(offset, match.index));
    parts.push(
      <Link
        key={match.index}
        href={match.url}
        prefetch={false}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 underline underline-offset-2"
      >
        {match.text}
      </Link>,
    );
    offset = match.lastIndex;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
