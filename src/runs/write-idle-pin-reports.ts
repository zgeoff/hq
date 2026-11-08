import type { Database } from 'bun:sqlite';
import type { SessionInfo } from '../atc/session-schema.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { buildPins } from '../pins/build-pins.ts';
import { fmtIdle } from '../pins/fmt-idle.ts';
import { readEvents } from '../read-events.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { roleName } from '../roles/role-name.ts';
import { findSessionIssue } from './find-session-issue.ts';
import { pickIdlePinReports } from './pick-idle-pin-reports.ts';
import type { SessionActivity } from './pick-quiet-sessions.ts';
import { readRunSessionRows } from './read-run-session-rows.ts';

export interface IdlePinOptions {
  actor: string;
  nowMs: number;
  readActivity: (id: string) => Promise<SessionActivity | null>;
}

// Tells the orchestrator once per idle stretch about each pinned session outside the fleet that
// has sat idle for over a day. It forgets nothing.
export async function writeIdlePinReports(db: Database, sessions: readonly SessionInfo[], options: IdlePinOptions): Promise<number> {
  const fleetNames = new Set(getDeclaredSessions().map((declared) => declared.name));
  const fleetIDs = new Set(sessions.filter((session) => fleetNames.has(session.name)).map((session) => session.id));
  const raw = sessions.filter((session) => session.pinned === true && !fleetIDs.has(session.id));
  const activity = new Map<string, number | null>();
  for (const session of raw) {
    const read = await options.readActivity(session.id);
    activity.set(session.id, read?.lastActivityAt ?? null);
  }
  const pins = buildPins(raw.map((session) => ({ id: session.id, name: session.name, state: session.state, alive: session.alive, pinned: true })), activity, new Date(options.nowMs));
  const lastReportMs = new Map<string, number>();
  for (const pin of pins) {
    const last = readEvents(db, 'hq', pin.id, ['idle-pin-report']).at(-1);
    if (last !== undefined) {
      lastReportMs.set(pin.id, Date.parse(last.at));
    }
  }
  const rows = readRunSessionRows(db);
  const reports = pickIdlePinReports(pins, fleetIDs, lastReportMs);
  for (const report of reports) {
    const pin = report.pin;
    const issue = findSessionIssue(rows, pin.id);
    const text = `${pin.name} (${pin.id.slice(0, 8)}) is pinned and has been idle for ${fmtIdle(pin.idleMs)}${issue === null ? '' : `, on run ${issue}`}. It is not part of the fleet; decide whether it still needs its pin.`;
    db.transaction(() => {
      const seq = logEvent(db, 'hq', pin.id, 'idle-pin-report', options.actor, null, null, { name: pin.name, issue, idleMs: pin.idleMs, idleSince: new Date(report.idleSinceMs).toISOString() });
      enqueue(db, seq, roleName('owner'), text);
    })();
  }
  return reports.length;
}
