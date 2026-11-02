import type { UnblockItem } from './unblock/types.ts';

export function formatUnblockLater(u: UnblockItem): string {
  return u.due_at === null ? '' : ` · later until ${u.due_at}`;
}
