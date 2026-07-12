// Client-side pre-validation mirroring src/lib/validation/bookmarks.ts
// (backend-dev-owned, authoritative) so field errors render immediately
// with the exact design-mandated copy (design.md §3.3.2/§3.3.4,
// AC-BM-005/007/008) without waiting on a network round trip. The API
// response is still parsed defensively (see api.ts) as a second line of
// defense for any rule this client copy doesn't cover.
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
