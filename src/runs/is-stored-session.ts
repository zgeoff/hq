// A run stores a short session id, which matches the full id atc lists by prefix.
export function isStoredSession(stored: readonly string[], id: string): boolean {
  return stored.some((short) => id.toLowerCase().startsWith(short.toLowerCase()));
}
