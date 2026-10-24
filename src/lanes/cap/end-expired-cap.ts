import type { Database } from 'bun:sqlite';
import { enqueue } from '../../outbox/enqueue.ts';
import { orchestratorName } from '../../wake/orchestrator-name.ts';
import { formatCapUntil } from './format-cap-until.ts';
import { isCapEnded } from './is-cap-ended.ts';
import { readLanesCap } from './read-lanes-cap.ts';
import { writeLanesCap } from './write-lanes-cap.ts';

export function endExpiredCap(db: Database, at: Date, actor: string): void {
  const stored = readLanesCap(db);
  if (stored.kind !== 'set' || !isCapEnded(stored.cap, at)) {
    return;
  }
  const seq = writeLanesCap(db, { action: 'cap-ended', cap: stored.cap, actor, reason: null });
  const until = stored.cap.until === null ? '' : ` (set until ${formatCapUntil(stored.cap.until)})`;
  enqueue(db, seq, orchestratorName(), `Lanes cap ${stored.cap.cap} ended${until}: slots are free again, so fill whatever the pool leaves free.`);
}
