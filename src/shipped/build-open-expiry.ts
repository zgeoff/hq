import { iso } from '../clock/iso.ts';

export function buildOpenExpiry(at: Date): string {
  const KEEP_MS = 5 * 60_000;
  return iso(new Date(at.getTime() + KEEP_MS));
}
