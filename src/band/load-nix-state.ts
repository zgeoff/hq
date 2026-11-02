import type { Database } from 'bun:sqlite';
import { lastSample } from '../probe/last-sample.ts';
import { openOutage } from '../probe/open-outage.ts';

export type NixState = { kind: 'down'; since: string } | { kind: 'unknown'; reason: string } | { kind: 'up' };

export function loadNixState(db: Database, at: Date): NixState {
  const STALE_MS = 5 * 60_000,
    last = lastSample(db),
    open = openOutage(db);
  if (open !== null) {
    return { kind: 'down', since: open.started_at };
  }
  if (last === null || at.getTime() - Date.parse(last.at) > STALE_MS) {
    return { kind: 'unknown', reason: 'no probe sample in 5 min' };
  }
  return last.target_ok === 0 && last.control_ok === 0 ? { kind: 'unknown', reason: 'the newest probe was blind' } : { kind: 'up' };
}
