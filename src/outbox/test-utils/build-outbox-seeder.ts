import { seedFailedOutbox } from './seed-failed-outbox.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';
import { seedSentOutbox } from './seed-sent-outbox.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

export function buildOutboxSeeder(deps: TestDeps) {
  return {
    outboxItem: (input?: Parameters<typeof seedOutboxItem>[1]) => seedOutboxItem(deps, input),
    sentOutbox: (input?: Parameters<typeof seedSentOutbox>[1]) => seedSentOutbox(deps, input),
    failedOutbox: (input?: Parameters<typeof seedFailedOutbox>[1]) => seedFailedOutbox(deps, input),
  };
}
