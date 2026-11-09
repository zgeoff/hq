import invariant from 'tiny-invariant';
import type { OutboxDeps } from './types.ts';
import { markOutboxSent } from '../mark-outbox-sent.ts';
import { readOutboxRows } from '../read-outbox-rows.ts';
import type { OutboxRow } from '../types.ts';
import type { NewOutboxItem } from './build-mock-new-outbox-item.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';

export function seedSentOutboxItem(deps: OutboxDeps, input: Partial<NewOutboxItem> = {}): OutboxRow {
  const pending = seedOutboxItem(deps, input);
  markOutboxSent(deps.db, pending, null);
  const row = readOutboxRows(deps.db).find((candidate) => candidate.id === pending.id);
  invariant(row?.status === 'sent');

  return row;
}
