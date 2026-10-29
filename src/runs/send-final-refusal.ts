import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { formatFinalRefusal } from './format-final-refusal.ts';
import type { RefusedFinal } from './types.ts';

interface FinalRefusal {
  issue: string;
  ref: string;
  given: string;
  refusal: RefusedFinal;
  actor: string;
}

export function sendFinalRefusal(db: Database, input: FinalRefusal): void {
  const seq = logEvent(db, 'run', input.issue, 'final-refused', input.actor, null, null, { ref: input.ref, given: input.given, ...input.refusal });
  enqueue(db, seq, orchestratorName(), `${input.issue}: ${formatFinalRefusal(input.ref, input.given, input.refusal)}`);
}
