// Discriminated result type for all provider operations (ADR-008,
// architecture.md §4.1) — providers never throw to callers; errors and
// unsupported operations are represented in-band so a single failing
// provider can be isolated without crashing the caller (AC-DOM-003,
// AC-PROV-003).

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "error"; message: string }
  | { ok: false; kind: "unsupported"; operation: string };
