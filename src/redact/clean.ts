import { redact } from './redact.ts';

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

// Redacted, whitespace collapsed, then capped.
export function clean(s: string, cap: number): string {
  return redact(flat(s)).slice(0, cap);
}
