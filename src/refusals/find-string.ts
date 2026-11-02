export function findString(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
