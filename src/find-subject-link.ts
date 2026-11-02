import type { ItemInput } from './parse-item-input.ts';
import { parseStoredExtras } from './parse-stored-extras.ts';
import type { UnblockItem } from './unblock/types.ts';

export function findSubjectLink(u: UnblockItem): ItemInput['links'][number] | null {
  return parseStoredExtras(u.item)?.links.find((l) => l.subject === true) ?? null;
}
