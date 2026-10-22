import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';

// One 1Password read hq made, for the weekly audit's count per consumer. `requests` is what
// 1Password charges for it: 3 for a lookup by name, 1 by item and vault ID.
export function recordOpRead(db: Database, consumer: 'linear' | 'noslop', requests: number): void {
  logEvent(db, 'hq', 'op', 'read', consumer, null, null, { consumer, requests });
}
