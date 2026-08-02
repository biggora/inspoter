// Surrogate snowflakes (specs/discord-webhook-compatibility.md §3.3).
//
// Inspoter ids are cuids; Discord ids are decimal snowflakes, and clients that
// parse them as BigInt would choke on a cuid. Every id leaving a Discord-shaped
// response is therefore mapped to a snowflake-looking 64-bit decimal: the top 42
// bits carry milliseconds since the Discord epoch, the low 22 bits a stable hash
// of the cuid.
//
// The mapping is deterministic and order-preserving in time, and deliberately
// NOT reversible — snowflakes are never accepted as input anywhere.

const DISCORD_EPOCH_MS = 1_420_070_400_000n; // 2015-01-01T00:00:00Z
const LOW_BITS = 22n;
const LOW_MASK = (1n << LOW_BITS) - 1n;

// FNV-1a over the id, folded into the 22 low bits.
function hash22(value: string): bigint {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return BigInt(hash) & LOW_MASK;
}

export function toSnowflake(id: string, createdAt?: Date | null): string {
  const ms = createdAt ? BigInt(createdAt.getTime()) : DISCORD_EPOCH_MS;
  const timestamp = ms > DISCORD_EPOCH_MS ? ms - DISCORD_EPOCH_MS : 0n;
  return ((timestamp << LOW_BITS) | hash22(id)).toString();
}
