export function formatError(e: unknown): string {
  return String((e as Error).message ?? e).slice(0, 200);
}
