import type { ItemExtras } from './parse-item-input.ts';
import { defineItemExtrasSchema } from './parse-item-input.ts';

const ExtrasSchema = defineItemExtrasSchema();

export function parseStoredExtras(raw: string | null): ItemExtras | null {
  if (raw === null) {
    return null;
  }
  return ExtrasSchema.parse(JSON.parse(raw));
}
