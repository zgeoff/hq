// Read once per 12 hours per process, so the long-running watcher picks up a rotated key.
export const KEY_CACHE: { value: string | null; expiresAt: number; ref: string | null } = { value: null, expiresAt: 0, ref: null };
