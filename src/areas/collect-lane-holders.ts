import type { AwakeReading } from './read-fresh-awake.ts';

export interface RunSessionRow {
  issue: string;
  session_id: string;
  added_at: string;
}

const IDLE_FREE_MS = 15 * 60_000;

// A session atc has not looked at holds a lane: an extra hold costs a slot, a missed one
// overfills the imp. Both times drop their milliseconds, so the reading's own second counts too.
export function collectLaneHolders(rows: readonly RunSessionRow[], reading: AwakeReading, at: Date): RunSessionRow[] {
  const awake = new Set(reading.ids);
  const seen = reading.seen === undefined ? null : new Set(reading.seen);
  const idle = reading.idle ?? {};
  const readAt = Date.parse(reading.at);
  return rows.filter((row) => {
    if (!awake.has(row.session_id)) {
      return Date.parse(row.added_at) >= readAt && seen?.has(row.session_id) !== true;
    }
    const since = idle[row.session_id];
    return since === undefined || at.getTime() - Date.parse(since) < IDLE_FREE_MS;
  });
}
