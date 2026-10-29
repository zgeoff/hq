import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { countOpenDesignRuns } from '../lanes/count-open-design-runs.ts';
import { DEFAULT_DESIGN_SLOTS } from '../lanes/default-design-slots.ts';
import type { DesignLane } from '../lanes/design-lane.ts';
import { readDesignIssues } from '../lanes/read-design-issues.ts';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import { removeLaneNudges } from '../lanes/remove-lane-nudges.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { checkRun } from '../transitions/check-run.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import { getRun } from './get-run.ts';
import type { AddRunInput, RunView } from './types.ts';
import { updateRunSessions as attachSession } from './update-run-sessions.ts';
import { viewRun } from './view-run.ts';

const sessionsSchema = z.array(z.object({ session_id: z.string() }));

export function addRun(db: Database, input: AddRunInput): { run: RunView; result: 'added' | 'noop' } {
  const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!SLUG.test(input.issue)) throw new HqError('bad_args', `issue "${input.issue}" must be a slug like GEO-123`);
  if (!input.title.trim()) throw new HqError('bad_args', 'title must not be empty');
  if (input.readySince && Number.isNaN(Date.parse(input.readySince))) throw new HqError('bad_args', '--ready-since must be a time, such as 2026-10-15T07:00:00Z');
  return db
    .transaction(() => {
      const prev = getRun(db, input.issue);
      if (prev && !CLOSED.includes(prev.state)) return { run: viewRun(db, prev), result: 'noop' as const };
      const t = iso(now());
      const lane = input.lane ?? (input.place === 'local' ? 'flexible' : null);
      const ready = input.readySince ? iso(new Date(input.readySince)) : null;
      const sizeFields = [input.size?.size ?? null, input.size?.lines ?? null] as const;
      const geoffChat = input.geoffChat ? 1 : 0;
      if (prev?.design_lane && !input.design) {
        checkRun(input.issue, 'design-to-build', prev.state, 'working');
        const oldSessions = sessionsSchema.parse(db.query('SELECT session_id FROM run_sessions WHERE issue = ? ORDER BY added_at').all(input.issue));
        db.query('UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?) WHERE issue = ? AND active = 1').run(t, input.issue);
        db.query(
          `UPDATE runs SET design_lane = NULL, state = 'working', closed_at = NULL, close_note = NULL, waits_on = NULL, waits_on_geoff = 0, live_check = NULL,
             title = ?, place = ?, next = ?, gate = ?, geoff_chat = ?, ready_since = ?, size = ?, size_lines = ?, lane = ?, updated_at = ? WHERE issue = ?`,
        ).run(input.title, input.place, input.next, input.gate, geoffChat, ready, ...sizeFields, lane, t, input.issue);
        if (input.session) {
          attachSession(db, input.issue, input.session);
        }
        logEvent(db, 'run', input.issue, 'design-to-build', input.actor, prev.state, 'working', { designLane: prev.design_lane, designSessions: oldSessions.map((row) => row.session_id), title: input.title, session: input.session });
      } else {
        if (prev) {
          throw new HqError('bad_state', `${input.issue} is ${prev.state}: hq run reopen ${input.issue}`);
        }
        const designLane = readDesignLane(db, input);
        db.query(
          `INSERT INTO runs (issue, title, place, state, next, gate, geoff_chat, ready_since, size, size_lines, lane, design_lane, created_at, updated_at)
           VALUES (?, ?, ?, 'working', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(input.issue, input.title, input.place, input.next, input.gate, geoffChat, ready, ...sizeFields, lane, designLane, t, t);
        if (input.session) {
          attachSession(db, input.issue, input.session);
        }
        logEvent(db, 'run', input.issue, 'added', input.actor, null, 'working', { title: input.title, session: input.session, readySince: input.readySince ?? null, size: input.size ?? null, designLane, asked: input.asked ?? null });
      }

      // A queued lanes nudge was planned before this run held its slot, so it may name this issue; the next look plans again.
      removeLaneNudges(db);
      return { run: viewRun(db, getRun(db, input.issue)!), result: 'added' as const };
    })
    .immediate();
}

// The design lane a new run fills: the --design flag, else with-geoff for a Design-type issue, else none (a
// delivery run). Refuses a pass above its lane count: an agent pass always, a with-geoff pass unless the
// owner asked for it somewhere.
function readDesignLane(db: Database, input: AddRunInput): DesignLane | null {
  const lane = input.design ?? (readDesignIssues(db).has(input.issue) ? 'with-geoff' : null);
  if (input.asked && lane !== 'with-geoff') {
    throw new HqError('bad_args', '--asked goes with a with-geoff design pass');
  }
  if (lane === null) {
    return null;
  }
  const slots = input.designSlots ?? DEFAULT_DESIGN_SLOTS;
  const open = countOpenDesignRuns(db);
  if (lane === 'agent' && open.agent >= slots.agent) {
    throw new HqError('design_full', `${input.issue}: all ${slots.agent} agent design passes are open (${openIssues(db, 'agent')}); close one with hq run done first`, { lane, open: open.agent, slots: slots.agent });
  }
  if (lane === 'with-geoff' && open.withGeoff >= slots.withGeoff && !input.asked) {
    throw new HqError('design_full', `${input.issue}: the with-geoff design lane is full at ${slots.withGeoff} (${openIssues(db, 'with-geoff')}); pass --asked <where the owner asked> to add it above the count`, { lane, open: open.withGeoff, slots: slots.withGeoff });
  }
  return lane;
}

function openIssues(db: Database, lane: DesignLane): string {
  return readDesignRuns(db)
    .filter((run) => run.lane === lane && !CLOSED.includes(run.state))
    .map((run) => run.issue)
    .join(', ') || 'none';
}
