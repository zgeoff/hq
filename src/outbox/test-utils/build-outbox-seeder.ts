import type { TestDeps } from '../../test-utils/build-seeder.ts';
import { seedFailedOutboxItem } from './seed-failed-outbox-item.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';
import { seedSentOutboxItem } from './seed-sent-outbox-item.ts';

export function buildOutboxSeeder(deps: TestDeps) {
  return {
    outboxItem: (input?: Parameters<typeof seedOutboxItem>[1]) => seedOutboxItem(deps, input),
    sentOutboxItem: (input?: Parameters<typeof seedSentOutboxItem>[1]) => seedSentOutboxItem(deps, input),
    failedOutboxItem: (input?: Parameters<typeof seedFailedOutboxItem>[1]) => seedFailedOutboxItem(deps, input),
  };
}
