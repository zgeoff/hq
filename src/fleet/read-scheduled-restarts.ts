import type { Database } from 'bun:sqlite';
import { collectScheduledSessions } from './collect-scheduled-sessions.ts';
import { pickScheduledReason } from './pick-scheduled-reason.ts';
import { recordSessionStarts } from './record-session-starts.ts';
import type { FleetEntry, FleetSession, TranscriptReader } from './types.ts';

export interface ScheduleDeps {
  db: Database;
  transcripts: TranscriptReader;
}

// The scheduled restarts due now, by name, each with why. Records the starts of the scheduled
// sessions, and reads a transcript through `transcripts` only when the age alone does not make its
// session due.
export async function readScheduledRestarts(deps: ScheduleDeps, fleet: FleetEntry[], sessions: Record<string, FleetSession>, nowMs: number): Promise<Record<string, string>> {
  const live = collectScheduledSessions(fleet, sessions);
  const starts = recordSessionStarts(deps.db, live);
  const due: Record<string, string> = {};
  for (const entry of fleet) {
    const session = live[entry.name];
    const start = starts[entry.name];
    if (!session || !start) {
      continue;
    }
    const why = await readDueReason(deps.transcripts, entry, session, nowMs - Date.parse(start.at));
    if (why !== null) {
      due[entry.name] = why;
    }
  }
  return due;
}

async function readDueReason(transcripts: TranscriptReader, entry: FleetEntry, session: FleetSession, ageMs: number): Promise<string | null> {
  const byAge = pickScheduledReason(ageMs, null);
  if (byAge !== null) {
    return byAge;
  }
  const compactions = await transcripts.compactions(session, entry.cwd);
  return pickScheduledReason(ageMs, compactions);
}
