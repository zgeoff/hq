import type { ItemInput } from './parse-item-input.ts';
import { parseStoredExtras } from './parse-stored-extras.ts';
import type { UnblockItem } from './unblock/types.ts';

// The link an unblock item is about, marked `"subject": true` in its `--item` links: the PR of a
// review, lgtm or merge ask. Null for an item filed as a task, or one with no marked link.
export function findSubjectLink(u: UnblockItem): ItemInput['links'][number] | null {
  return parseStoredExtras(u.item)?.links.find((l) => l.subject === true) ?? null;
}
