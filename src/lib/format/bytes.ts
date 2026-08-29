// Byte formatting for the metric surfaces. Extracted from
// src/components/servers/servers-view.tsx when the dashboard's server-metrics
// widget needed the same figures: a tile and a server card must not disagree on
// how "1.8 / 3.7 GB · 48%" is written.

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Attachment-size wording keys ("12.4 MB") in the feature namespace that owns them. */
export type ByteUnitKey = "byteUnitB" | "byteUnitKb" | "byteUnitMb";

/**
 * Human size for a single `number` of bytes (mail attachments). Callers pass
 * their namespace's `t` for localized unit labels; without it the units fall
 * back to their universal abbreviations.
 */
export function formatByteSize(
  sizeBytes: number,
  t?: (key: ByteUnitKey) => string,
): string {
  const unit = (key: ByteUnitKey, fallback: string) => (t ? t(key) : fallback);
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} ${unit("byteUnitMb", "MB")}`;
  }
  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} ${unit("byteUnitKb", "KB")}`;
  }
  return `${sizeBytes} ${unit("byteUnitB", "B")}`;
}

// Index of the unit a value reads best in, so a used/total pair can be printed
// in one shared unit instead of "28.0 GB / 74.8 GB".
export function byteUnitIndex(bytes: bigint): number {
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return unitIndex;
}

export function formatBytesIn(bytes: bigint, unitIndex: number): string {
  const value = Number(bytes) / 1024 ** unitIndex;
  return value.toFixed(unitIndex === 0 ? 0 : 1);
}

// "28.0 / 74.8 GB" — the unit is taken from the total and printed once.
export function formatBytesPair(used: bigint, total: bigint): string {
  const unitIndex = byteUnitIndex(total);
  return `${formatBytesIn(used, unitIndex)} / ${formatBytesIn(total, unitIndex)} ${BYTE_UNITS[unitIndex]}`;
}

export interface ResourceUsage {
  // Whole percent: the meter is segmented, so extra precision would only make
  // the value harder to read and the markup noisier.
  percent: number;
  // "1.8 / 3.7 GB · 48%" — absolute figures for precision, percentage for the
  // instant read of how full the resource is.
  text: string;
}

/**
 * Turns an agent snapshot's total/available pair (BigInt columns serialized as
 * decimal strings) into a percentage plus its printable form. Null when the
 * metric is missing or the total is zero — there is no usage to state then.
 */
export function usageFromTotals(
  total: string | null,
  available: string | null,
): ResourceUsage | null {
  if (!total || !available) return null;
  const totalBytes = BigInt(total);
  if (totalBytes <= 0n) return null;
  const usedBytes = totalBytes - BigInt(available);
  const percent = Math.round((Number(usedBytes) / Number(totalBytes)) * 100);
  return {
    percent,
    text: `${formatBytesPair(usedBytes, totalBytes)} · ${percent}%`,
  };
}
