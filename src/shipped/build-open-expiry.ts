import { iso } from '../clock/iso.ts';

// When an entry that can still change stops being served: 5 minutes after it was read.
export function buildOpenExpiry(at: Date): string {
  const KEEP_MS = 5 * 60_000;
  return iso(new Date(at.getTime() + KEEP_MS));
}
