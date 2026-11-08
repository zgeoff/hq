import type { Database } from 'bun:sqlite';
import type { FleetSession } from '../fleet/types.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { collectOrphanEvents } from './collect-orphan-events.ts';
import { isOverFailedChild } from './is-over-failed-child.ts';
import { pickOrphanSessions } from './pick-orphan-sessions.ts';
import type { CheckedOrphan } from './pick-orphan-trees.ts';
import { pickOrphanTrees } from './pick-orphan-trees.ts';
import { readRunSessionRows } from './read-run-session-rows.ts';
import { readWorkSafely } from './read-work-safely.ts';
import { forgetTree } from './run-wrap-up.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import type { OrphanEvent, WrapUp } from './types.ts';

export interface OrphanOptions {
  actor: string;
  log: (line: string) => void;
  nowMs: number;
}

export async function removeOrphanSessions(db: Database, deps: WrapUpDeps, sessions: readonly FleetSession[], options: OrphanOptions): Promise<void> {
  const picked = pickOrphanSessions({
    sessions,
    fleetNames: new Set(getDeclaredSessions().map((declared) => declared.name)),
    runSessions: readRunSessionRows(db),
    lastKeptMs: readLastKeptMs(db, sessions),
    nowMs: options.nowMs,
  });
  if (picked.length === 0) {
    return;
  }
  const readers = { imp: deps.readImpWork, local: deps.readLocalWork };
  const checked: CheckedOrphan[] = [];
  for (const orphan of picked) {
    checked.push({ ...orphan, work: await readWorkSafely(readers[orphan.place], orphan.session) });
  }
  const plan = pickOrphanTrees(checked);
  writeOrphanEvents(db, plan.kept, options);
  if (plan.trees.length === 0) {
    return;
  }
  const client = await deps.openClient();
  const failedIDs = new Set<string>();
  for (const tree of plan.trees) {
    // The child's kept event holds the parent back on later sweeps too.
    if (isOverFailedChild(tree.root, checked, failedIDs)) {
      failedIDs.add(tree.root.session.id);
      continue;
    }
    const wrapUp: WrapUp = { forgotten: [], destroyed: [], kept: [], failed: [] };
    await forgetTree({ client, wrapUp }, { kind: 'forget', root: tree.root.session, children: [], destroyImp: tree.destroyImp });
    writeOrphanEvents(db, collectOrphanEvents(tree, wrapUp), options);
    for (const failure of wrapUp.failed) {
      failedIDs.add(failure.id);
    }
  }
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

function writeOrphanEvents(db: Database, events: readonly OrphanEvent[], options: OrphanOptions): void {
  for (const event of events) {
    logEvent(db, 'hq', event.sessionID, event.action, options.actor, null, null, event.data);
    options.log(event.line);
  }
}
