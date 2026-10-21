import type { ItemExtras } from './parse-item-input.ts';

export function parseStoredExtras(raw: string | null): ItemExtras | null {
  if (raw === null) {
    return null;
  }
  return JSON.parse(raw) as ItemExtras;
}
