import type { UnblockItem } from './types.ts';

// An open item whose deadline has passed.
export function isOverdue(item: Pick<UnblockItem, 'state' | 'deadline'>, at: Date): boolean {
  return item.state === 'open' && item.deadline !== null && Date.parse(item.deadline) <= at.getTime();
}
