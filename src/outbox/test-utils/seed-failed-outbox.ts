import { markOutboxFailed } from '../mark-outbox-failed.ts';
import { unsent } from '../unsent.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

interface FailedInput {
  text: string;
  topic: string;
  error: string;
}

// Marks the pending rows the outbox holds as failed, the rows with the given text and topic only when they are set.
export function seedFailedOutbox(deps: TestDeps, input: Partial<FailedInput> = {}): void {
  const rows = unsent(deps.db, false, undefined).filter((row) => (input.text === undefined || row.text === input.text) && (input.topic === undefined || row.topic === input.topic));
  markOutboxFailed(deps.db, rows, input.error ?? 'invented send failure');
}
