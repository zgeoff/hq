// The key, in memory only: read once per 12 hours per process, so the long-running watcher picks up
// a rotated key, and dropped on a 401 or 403 and by resetKey. expiresAt is epoch milliseconds.
export const KEY_CACHE: { value: string | null; expiresAt: number; ref: string | null } = { value: null, expiresAt: 0, ref: null };
