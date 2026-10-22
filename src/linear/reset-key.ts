import { KEY_CACHE } from './key-cache.ts';

export function resetKey(): void {
  KEY_CACHE.value = null;
  KEY_CACHE.expiresAt = 0;
  KEY_CACHE.ref = null;
}
