import invariant from 'tiny-invariant';
import type { TestDeps } from '../../test-utils/build-seeder.ts';
import { markOutboxFailed } from '../mark-outbox-failed.ts';
import { readOutboxRows } from '../read-outbox-rows.ts';
import type { OutboxRow } from '../types.ts';
import type { NewOutboxItem } from './build-mock-new-outbox-item.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';

export function seedFailedOutboxItem(deps: TestDeps, input: Partial<NewOutboxItem> = {}): OutboxRow {
  const pending = seedOutboxItem(deps, input);
  markOutboxFailed(deps.db, [pending], 'invented send failure');
  const row = readOutboxRows(deps.db).find((candidate) => candidate.id === pending.id);
  invariant(row?.status === 'failed');

  return row;
}
