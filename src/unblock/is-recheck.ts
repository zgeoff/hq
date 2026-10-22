import { findSubjectLink } from '../find-subject-link.ts';
import type { UnblockItem } from './types.ts';

const RECHECK_AFTER_MS = 3 * 86_400_000;

export function isRecheck(item: UnblockItem, at: Date): boolean {
  return item.state === 'open' && item.done_when.length === 0 && findSubjectLink(item) === null && at.getTime() - Date.parse(item.added_at) > RECHECK_AFTER_MS;
}
