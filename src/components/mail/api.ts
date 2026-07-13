// Thin fetch wrapper for the /api/mail route (backend-dev-owned,
// src/app/api/mail/**). Mirrors src/components/logs/api.ts: JSON-serialized
// entries have `receivedAt` as an ISO string, hence a dedicated DTO rather
// than reusing the generated Prisma `MailItem` type.

export interface MailItemDto {
  id: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface FetchMailParams {
  cursor?: string;
  sender?: string;
  query?: string;
  sort?: "asc" | "desc";
}

export interface FetchMailResult {
  items: MailItemDto[];
  nextCursor: string | null;
}

export async function fetchMail(
  params: FetchMailParams,
): Promise<FetchMailResult> {
  const searchParams = new URLSearchParams();
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.sender) searchParams.set("sender", params.sender);
  if (params.query) searchParams.set("query", params.query);
  if (params.sort) searchParams.set("sort", params.sort);

  const res = await fetch(`/api/mail?${searchParams}`);
  if (!res.ok) {
    throw new Error("Couldn't load mail. Try again.");
  }
  return res.json();
}

// List rows already include `body` (src/lib/services/mail.ts `list()`
// selects the full row), so the view doesn't need this for the inline
// expand/collapse detail. Provided for API completeness / direct-link
// scenarios against GET /api/mail/[id].
export async function fetchMailById(id: string): Promise<MailItemDto> {
  const res = await fetch(`/api/mail/${id}`);
  if (!res.ok) {
    throw new Error("Couldn't load mail. Try again.");
  }
  return res.json();
}
