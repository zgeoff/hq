import type { Database } from 'bun:sqlite';
import { dropTopic } from '../outbox/drop-topic.ts';
import { forwardOf } from '../outbox/forward-of.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';

// A queued nudge sits at the orchestrator's forwarded destination, not under its own name.
export function removeLaneNudges(db: Database): void {
  const orchestrator = orchestratorName();
  dropTopic(db, orchestrator, 'lanes');
  dropTopic(db, forwardOf(db, orchestrator), 'lanes');
}
