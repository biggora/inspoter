// What an operator may type to point a YouTube widget at a channel: a channel
// ID, an @handle, or a link to the channel page. Pure string work with no
// imports, because the widget's zod schema validates with it; resolving a handle
// to an ID is youtube.ts's job and needs the network.

export type YoutubeChannelRef =
  | { type: "id"; id: string }
  | { type: "handle"; handle: string }
  | { type: "legacy"; path: string };

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
// YouTube handles may use any letters (Cyrillic, Latvian diacritics, ...) and
// the middle dot, not just ASCII.
const HANDLE = /^[\p{L}\p{M}\p{N}._·-]{3,30}$/u;
const LEGACY_NAME = /^[\p{L}\p{N}._-]{1,100}$/u;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

function refFromPath(segments: string[]): YoutubeChannelRef | null {
  const [head, name] = segments;
  if (head === undefined) return null;
  if (head === "channel" && name !== undefined && CHANNEL_ID.test(name)) {
    return { type: "id", id: name };
  }
  if (head.startsWith("@") && HANDLE.test(head.slice(1))) {
    return { type: "handle", handle: head.slice(1) };
  }
  if (
    (head === "c" || head === "user") &&
    name !== undefined &&
    LEGACY_NAME.test(name)
  ) {
    return { type: "legacy", path: `${head}/${name}` };
  }
  return null;
}

export function parseYoutubeChannelInput(
  input: string,
): YoutubeChannelRef | null {
  const value = input.trim();
  if (CHANNEL_ID.test(value)) return { type: "id", id: value };
  if (value.startsWith("@")) {
    return HANDLE.test(value.slice(1))
      ? { type: "handle", handle: value.slice(1) }
      : null;
  }

  // A link may be pasted without its scheme ("youtube.com/@name").
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  let segments: string[];
  try {
    segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  return refFromPath(segments);
}
