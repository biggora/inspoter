import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// Password hashing primitives (architecture.md §5.2, ADR-002). scrypt via
// Node's built-in `crypto` — no native build dependency in the Docker image.
// Stored format in Operator.passwordHash: "<hex-salt>:<hex-derived-key>".
//
// NOTE: prisma/seed.ts intentionally re-implements a minimal copy of
// hashPassword() rather than importing this module, because that script runs
// via a plain `node prisma/seed.ts` invocation with no bundler/path-alias
// resolution in the loop (see prisma/seed.ts header comment for why). Keep
// the algorithm and parameters (scrypt, 16-byte salt, 64-byte derived key)
// in sync between the two if either ever changes.

const KEY_LENGTH = 64;
const scryptAsync = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;

  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hashHex, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;

  return timingSafeEqual(derivedKey, storedBuffer);
}
