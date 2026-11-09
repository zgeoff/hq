import invariant from 'tiny-invariant';
import { seedEvent } from '../../test-utils/seed-event.ts';
import { enqueue } from '../enqueue.ts';
import { readOutboxRows } from '../read-outbox-rows.ts';
import type { OutboxRow } from '../types.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

interface NewOutboxItem {
  target: string;
  text: string;
  topic: string | null;
}

export function seedOutboxItem(deps: TestDeps, input: Partial<NewOutboxItem> = {}): OutboxRow {
  const eventSeq = seedEvent(deps);
  enqueue(deps.db, eventSeq, input.target ?? 'kettle-bot', input.text ?? 'Invented kettle note', input.topic ?? null);
  const row = readOutboxRows(deps.db).find((candidate) => candidate.event_seq === eventSeq);
  invariant(row?.status === 'pending');

  return row;
}
