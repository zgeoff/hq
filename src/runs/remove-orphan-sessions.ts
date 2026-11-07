import { isOneOf } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { FleetClient, FleetSession, StaleOps } from '../fleet/types.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { toErrorMessage } from '../to-error-message.ts';
import { buildWrapUpPlan } from './build-wrap-up-plan.ts';
import { forgetImpSession } from './forget-imp-session.ts';
import { forgetWrappedSession } from './forget-wrapped-session.ts';
import { isStoredSession, pickOrphanSessions } from './pick-orphan-sessions.ts';
import { isOnImp } from './run-wrap-up.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import type { ImpWork } from './types.ts';

const RunSessionRows = z.array(z.object({ session_id: z.string(), issue: z.string(), active: z.number(), state: z.string() }));

export interface OrphanOptions {
  actor: string;
  log: (line: string) => void;
  nowMs: number;
}

// A session that stays is logged with its reason and checked again only a day later, so the sweep
// does not run the unpushed-work check on it every few minutes.
export async function removeOrphanSessions(db: Database, deps: WrapUpDeps, sessions: readonly FleetSession[], options: OrphanOptions): Promise<string[]> {
  const rows = RunSessionRows.parse(
    db.query('SELECT s.session_id, s.issue, s.active, r.state FROM run_sessions s JOIN runs r ON r.issue = s.issue ORDER BY s.added_at, s.session_id').all(),
  );
  const picked = pickOrphanSessions({
    sessions,
    fleetNames: new Set(getDeclaredSessions().map((declared) => declared.name)),
    recorded: rows.map((row) => row.session_id),
    openActive: rows.filter((row) => row.active === 1 && !isOneOf(row.state, CLOSED_RUN_STATES)).map((row) => row.session_id),
  });
  const forgotten: string[] = [];
  const staying = new Set<string>();
  if (picked.length === 0) {
    return forgotten;
  }
  const client = await deps.openClient();
  for (const session of picked) {
    const hasStayingChild = picked.some((child) => child.parent === session.id && staying.has(child.id));
    if (hasStayingChild || probeRecentlyKept(db, session.id, options.nowMs)) {
      staying.add(session.id);
      continue;
    }
    const issue = rows.findLast((row) => isStoredSession([row.session_id], session.id))?.issue ?? null;
    const onImp = isOnImp(session, false);
    const readWork = onImp ? deps.readImpWork : deps.readLocalWork;
    const place = onImp ? 'imp' : 'local';
    const work = await readWorkSafely(readWork, session);
    const plan = buildWrapUpPlan(session.id, [], work, place);
    if (plan.kind === 'keep') {
      const reason = plan.kept[0]?.reason ?? 'unpushed work';
      logEvent(db, 'hq', session.id, 'session-kept', options.actor, null, null, { reason, issue });
      options.log(`orphan session ${session.id} (${session.name}) kept: ${reason}`);
      staying.add(session.id);
      continue;
    }
    try {
      const destroyed = await removeSession(client, session.id, plan.destroyImp);
      logEvent(db, 'hq', session.id, 'session-forgotten', options.actor, null, null, { name: session.name, issue, reason: 'exited, with its work pushed and no open run needing it', destroyed });
      options.log(`orphan session ${session.id} (${session.name}) forgotten`);
      forgotten.push(session.id);
    } catch (error) {
      const reason = `forget failed: ${toErrorMessage(error)}`;
      logEvent(db, 'hq', session.id, 'session-kept', options.actor, null, null, { reason, issue });
      options.log(`orphan session ${session.id} (${session.name}) kept: ${reason}`);
      staying.add(session.id);
    }
  }
  return forgotten;
}

const RETRY_MS = 24 * 3_600_000;

function probeRecentlyKept(db: Database, id: string, nowMs: number): boolean {
  const last = readEvents(db, 'hq', id, ['session-kept']).at(-1);
  return last !== undefined && nowMs - Date.parse(last.at) < RETRY_MS;
}

async function readWorkSafely(read: (session: FleetSession) => Promise<ImpWork>, session: FleetSession): Promise<ImpWork> {
  try {
    return await read(session);
  } catch (error) {
    return { state: 'unknown', detail: toErrorMessage(error) };
  }
}

async function removeSession(client: FleetClient & StaleOps, id: string, destroyImp: boolean): Promise<boolean> {
  if (destroyImp) {
    const forgotten = await forgetImpSession(client, id);
    return forgotten.destroyed;
  }
  await forgetWrappedSession(client, id);
  return false;
}
