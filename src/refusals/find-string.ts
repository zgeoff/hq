// A non-empty string, or null for anything else.
export function findString(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
