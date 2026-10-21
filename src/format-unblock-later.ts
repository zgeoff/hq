import type { UnblockItem } from './unblock/types.ts';

// The tail `hq unblock list` adds for an item put off from the console.
export function formatUnblockLater(u: UnblockItem): string {
  return u.due_at === null ? '' : ` · later until ${u.due_at}`;
}
