import { markOutboxSent } from '../mark-outbox-sent.ts';
import { unsent } from '../unsent.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

interface SentFilter {
  text: string;
  topic: string;
}

// Marks the pending and failed rows the outbox holds as sent, the rows with the given text and topic only when they are set.
export function seedSentOutbox(deps: TestDeps, input: Partial<SentFilter> = {}): void {
  for (const row of unsent(deps.db, true, undefined)) {
    if ((input.text === undefined || row.text === input.text) && (input.topic === undefined || row.topic === input.topic)) {
      markOutboxSent(deps.db, row, null);
    }
  }
}
