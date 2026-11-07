import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const stepOf = (ms = Date.now()): number => Math.floor(ms / 1000 / 30);

/** RFC 6238 TOTP (SHA1, 6 digits, 30 s). */
export function totp(secretBase32: string, step = stepOf()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const off = h[h.length - 1]! & 0x0f;
  const n = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Wait until the clock is past `lastStep` (the server rejects replays of a used step), then return a code. */
export async function freshTotp(secretBase32: string, lastStep: number): Promise<string> {
  while (stepOf() <= lastStep) await new Promise((r) => setTimeout(r, 500));
  return totp(secretBase32);
}
