import type { Database } from 'bun:sqlite';
import type { FleetClient, FleetSession, StaleOps } from '../fleet/types.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { toErrorMessage } from '../to-error-message.ts';
import { forgetImpSession } from './forget-imp-session.ts';
import { forgetWrappedSession } from './forget-wrapped-session.ts';
import { pickOrphanOutcome } from './pick-orphan-outcome.ts';
import { pickOrphanSessions } from './pick-orphan-sessions.ts';
import { readRunSessionRows } from './read-run-session-rows.ts';
import { readWorkSafely } from './read-work-safely.ts';
import { isOnImp } from './run-wrap-up.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';

export interface OrphanOptions {
  actor: string;
  log: (line: string) => void;
  nowMs: number;
}

export async function removeOrphanSessions(db: Database, deps: WrapUpDeps, sessions: readonly FleetSession[], options: OrphanOptions): Promise<string[]> {
  const picked = pickOrphanSessions({
    sessions,
    fleetNames: new Set(getDeclaredSessions().map((declared) => declared.name)),
    runSessions: readRunSessionRows(db),
    lastKeptMs: readLastKeptMs(db, sessions),
    nowMs: options.nowMs,
  });
  const forgotten: string[] = [];
  const staying = new Set<string>();
  if (picked.length === 0) {
    return forgotten;
  }
  const client = await deps.openClient();
  for (const orphan of picked) {
    const session = orphan.session;
    const issue = orphan.issue;
    if (picked.some((child) => child.session.parent === session.id && staying.has(child.session.id))) {
      staying.add(session.id);
      continue;
    }
    const onImp = isOnImp(session, false);
    const readWork = onImp ? deps.readImpWork : deps.readLocalWork;
    const place = onImp ? 'imp' : 'local';
    const work = await readWorkSafely(readWork, session);
    const outcome = pickOrphanOutcome(session.id, work, place);
    if (outcome.kind === 'keep') {
      logEvent(db, 'hq', session.id, 'session-kept', options.actor, null, null, { reason: outcome.reason, issue });
      options.log(`orphan session ${session.id} (${session.name}) kept: ${outcome.reason}`);
      staying.add(session.id);
      continue;
    }
    try {
      const destroyed = await removeSession(client, session.id, outcome.destroyImp);
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

function readLastKeptMs(db: Database, sessions: readonly FleetSession[]): Map<string, number> {
  const lastKeptMs = new Map<string, number>();
  for (const session of sessions) {
    const last = readEvents(db, 'hq', session.id, ['session-kept']).at(-1);
    if (last !== undefined) {
      lastKeptMs.set(session.id, Date.parse(last.at));
    }
  }
  return lastKeptMs;
}

async function removeSession(client: FleetClient & StaleOps, id: string, destroyImp: boolean): Promise<boolean> {
  if (destroyImp) {
    const forgotten = await forgetImpSession(client, id);
    return forgotten.destroyed;
  }
  await forgetWrappedSession(client, id);
  return false;
}
