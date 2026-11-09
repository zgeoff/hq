import invariant from 'tiny-invariant';
import type { TestDeps } from '../../test-utils/build-seeder.ts';
import { seedEvent } from '../../test-utils/seed-event.ts';
import { enqueue } from '../enqueue.ts';
import { readOutboxRows } from '../read-outbox-rows.ts';
import type { OutboxRow } from '../types.ts';
import { buildMockNewOutboxItem } from './build-mock-new-outbox-item.ts';
import type { NewOutboxItem } from './build-mock-new-outbox-item.ts';

export function seedOutboxItem(deps: TestDeps, input: Partial<NewOutboxItem> = {}): OutboxRow {
  const item = buildMockNewOutboxItem(input);
  const eventSeq = seedEvent(deps);
  enqueue(deps.db, eventSeq, item.target, item.text, item.topic);
  const row = readOutboxRows(deps.db).find((candidate) => candidate.event_seq === eventSeq);
  invariant(row?.status === 'pending');

  return row;
}
