import type { Database } from 'bun:sqlite';
import { STALE_LIMITS } from './stale-limits.ts';
import { readCompactionCount } from './read-compaction-count.ts';
import { recordSessionStarts } from './record-session-starts.ts';
import { SCHEDULED_ROLES } from './scheduled-roles.ts';
import type { FleetEntry, FleetSession } from './types.ts';

// The scheduled restarts due now, by name, each with why: a session of a scheduled role is due
// 6 h after its start, or after 3 compactions since it, whichever comes first. The transcript is
// read only when the age alone does not make the session due.
export async function readScheduledRestarts(db: Database, fleet: FleetEntry[], sessions: Record<string, FleetSession>, nowMs: number): Promise<Record<string, string>> {
  const live: Record<string, FleetSession> = {};
  const due: Record<string, string> = {};
  for (const entry of fleet) {
    const session = sessions[entry.name];
    if (session && entry.roles?.some((role) => SCHEDULED_ROLES.includes(role)) === true) {
      live[entry.name] = session;
    }
  }
  const starts = recordSessionStarts(db, live);
  for (const entry of fleet) {
    const session = live[entry.name];
    const start = starts[entry.name];
    if (!session || !start) {
      continue;
    }
    const why = await readDueReason(entry, session, nowMs - Date.parse(start.at));
    if (why !== null) {
      due[entry.name] = why;
    }
  }
  return due;
}

async function readDueReason(entry: FleetEntry, session: FleetSession, ageMs: number): Promise<string | null> {
  if (ageMs >= STALE_LIMITS.scheduleAgeMs) {
    return `${STALE_LIMITS.scheduleAgeMs / 3_600_000} h since start`;
  }
  if ((await readCompactionCount(session, entry.cwd)) >= STALE_LIMITS.scheduleCompactions) {
    return `${STALE_LIMITS.scheduleCompactions} compactions since start`;
  }
  return null;
}
