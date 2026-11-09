import invariant from 'tiny-invariant';
import { getUnblock } from '../get-unblock.ts';
import type { UnblockInput, UnblockItem } from '../types.ts';
import { writeOverdueNotice } from '../write-overdue-notice.ts';
import { seedUnblock } from './seed-unblock.ts';
import type { UnblockDeps } from './types.ts';

export function seedOverdueToldUnblock(deps: UnblockDeps, input: Partial<UnblockInput> = {}): UnblockItem {
  const item = seedUnblock(deps, { kind: 'watch', deadline: '2026-10-14T00:30:00Z', ...input });
  invariant(item.deadline !== null);
  const toldAt = new Date(Date.parse(item.deadline) + 10 * 60_000);
  invariant(writeOverdueNotice(deps.db, { id: item.id, actor: 'hq', at: toldAt, ownerSession: 'z-stu' }));
  const told = getUnblock(deps.db, item.id);
  invariant(told !== null && told.overdue_told_at !== null);

  return told;
}
