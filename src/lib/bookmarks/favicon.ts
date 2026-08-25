// Favicon suggestion for a bookmark URL. SSRF-safe by construction: the
// bookmark's own URL and host are never fetched — only its hostname is
// extracted and passed as a query-string value to Google's public
// favicon-inference endpoint, so the outbound TCP target is always
// www.google.com.
//
// Lives here rather than in the route that first needed it because three
// callers now share it: the browser route, the agent REST route, and the MCP
// tool.

export function buildFaviconSuggestUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
}

// Answers the suggested icon URL, or null when the endpoint has no icon for
// that host. A failed or slow probe is a null suggestion, never an error: the
// caller is filling in an optional field.
export async function suggestFavicon(url: string): Promise<string | null> {
  const suggestUrl = buildFaviconSuggestUrl(new URL(url).hostname);
  try {
    const response = await fetch(suggestUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    const contentType = response.headers.get("content-type");
    return response.ok && contentType?.startsWith("image/") ? suggestUrl : null;
  } catch {
    return null;
  }
}
