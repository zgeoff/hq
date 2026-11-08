import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { FleetClient, FleetSession, StaleOps } from '../fleet/types.ts';
import { buildWrapUpPlan } from './build-wrap-up-plan.ts';
import { forgetImpSession } from './forget-imp-session.ts';
import { forgetWrappedSession } from './forget-wrapped-session.ts';
import { fullSessionId } from './full-session-id.ts';
import { readWorkSafely } from './read-work-safely.ts';
import { requireRun } from './require-run.ts';
import { toErrorMessage } from '../to-error-message.ts';
import type { ImpWork, KeptSession, WrapUp } from './types.ts';
import { writeWrapUpNote } from './write-wrap-up-note.ts';

const sessionRowSchema = z.object({ session_id: z.string() });

export interface WrapUpDeps {
  openClient: () => Promise<FleetClient & StaleOps>;
  readImpWork: (session: FleetSession) => Promise<ImpWork>;
  readLocalWork: (session: FleetSession) => Promise<ImpWork>;
}

// A pass that retries every sweep sets onlyNoteAction, so a retry that changes nothing leaves no
// note. A pass that checked sessions before the wrap-up sets onlySessions to their full ids, so a
// session attached since its check stays.
export type WrapUpOptions = { dryRun: true } | { dryRun?: false; actor: string; onlyNoteAction?: boolean; onlySessions?: readonly string[] };

export async function runWrapUp(db: Database, deps: WrapUpDeps, issue: string, options: WrapUpOptions): Promise<WrapUp> {
  const run = requireRun(db, issue);

  // A session id is on one run only, so a session removed by hand is still this run's to forget.
  const rows = db.query('SELECT session_id FROM run_sessions WHERE issue = ? ORDER BY added_at, session_id').all(issue);
  const only = options.dryRun === true ? null : (options.onlySessions ?? null);
  const ids = rows.map((row) => sessionRowSchema.parse(row).session_id).filter((id) => isAllowed(only, id));
  const wrapUp: WrapUp = { forgotten: [], destroyed: [], kept: [], failed: [] };
  if (run.geoff_chat === 1) {
    wrapUp.kept = ids.map((id) => ({ id, reason: 'the owner chats on this run' }));
  } else if (ids.length > 0) {
    try {
      const client = await deps.openClient();
      const sessions = await client.sessions();
      const fullIDs = await resolveSessionIDs(ids, sessions, wrapUp);
      const roots = sessions.filter((session) => fullIDs.includes(session.id) && !fullIDs.includes(session.parent ?? ''));
      for (const root of roots) {
        await wrapUpTree({ client, deps, sessions, wrapUp, placedOnImp: run.place === 'imp', dryRun: options.dryRun === true, only }, root);
      }
    } catch (error) {
      const reason = `atc: ${toErrorMessage(error)}`;
      wrapUp.failed.push(...ids.map((id) => ({ id, reason })));
    }
  }
  if (options.dryRun !== true && (options.onlyNoteAction !== true || wrapUp.forgotten.length > 0)) {
    writeWrapUpNote(db, issue, wrapUp, options.actor);
  }
  return wrapUp;
}

// A stored id can be a short prefix of the full id.
function isAllowed(only: readonly string[] | null, id: string): boolean {
  return only === null || only.some((full) => full.toLowerCase().startsWith(id.toLowerCase()));
}

async function resolveSessionIDs(ids: string[], sessions: FleetSession[], wrapUp: WrapUp): Promise<string[]> {
  const fullIDs: string[] = [];
  for (const id of ids) {
    try {
      const fullID = await fullSessionId(() => Promise.resolve(sessions), id);
      fullIDs.push(fullID);
    } catch (error) {
      if (!(error instanceof HqError && error.code === 'no_such_session')) {
        wrapUp.failed.push({ id, reason: toErrorMessage(error) });
      }
    }
  }
  return fullIDs;
}

interface TreePass {
  client: FleetClient & StaleOps;
  deps: WrapUpDeps;
  sessions: FleetSession[];
  wrapUp: WrapUp;
  placedOnImp: boolean;
  dryRun: boolean;
  only: readonly string[] | null;
}

async function wrapUpTree(pass: TreePass, root: FleetSession): Promise<void> {
  const decision = await planTree(pass, root);
  await match(decision)
    .with({ kind: 'keep' }, (keep) => {
      pass.wrapUp.kept.push(...keep.kept);
      return Promise.resolve();
    })
    .with({ kind: 'forget' }, (forget) => (pass.dryRun ? Promise.resolve(reportForget(pass, forget)) : forgetTree(pass, forget)))
    .exhaustive();
}

export interface ForgetDecision {
  kind: 'forget';
  children: FleetSession[];
  root: FleetSession;
  destroyImp: boolean;
}

type TreeDecision = { kind: 'keep'; kept: KeptSession[] } | ForgetDecision;

async function planTree(pass: TreePass, root: FleetSession): Promise<TreeDecision> {
  const children = collectChildren(pass.sessions, root.id).filter((child) => isAllowed(pass.only, child.id));
  const tree = [...children, root];
  if (tree.some((session) => session.pinned === true)) {
    return { kind: 'keep', kept: tree.map((session) => ({ id: session.id, reason: 'pinned in atc' })) };
  }
  const onImp = isOnImp(root, pass.placedOnImp);
  const readWork = onImp ? pass.deps.readImpWork : pass.deps.readLocalWork;
  const place = onImp ? 'imp' : 'local';
  const work = await readWorkSafely(readWork, root);
  const plan = buildWrapUpPlan(root.id, children.map((child) => child.id), work, place);
  if (plan.kind === 'keep') {
    return { kind: 'keep', kept: plan.kept };
  }
  return { kind: 'forget', children, root, destroyImp: plan.destroyImp };
}

function collectChildren(sessions: FleetSession[], parentID: string): FleetSession[] {
  const found: FleetSession[] = [];
  for (const child of sessions.filter((session) => session.parent === parentID)) {
    found.push(...collectChildren(sessions, child.id), child);
  }
  return found;
}

export function isOnImp(session: FleetSession, placedOnImp: boolean): boolean {
  const targetID = session.locator?.targetID;
  if (typeof targetID === 'string') {
    return targetID !== 'local';
  }
  const vm = session.lifecycle?.vm;
  if (typeof vm === 'string') {
    return vm !== 'none';
  }
  return placedOnImp;
}

function reportForget(pass: TreePass, decision: ForgetDecision): void {
  pass.wrapUp.forgotten.push(...decision.children.map((child) => child.id), decision.root.id);
  if (decision.destroyImp) {
    pass.wrapUp.destroyed.push(decision.root.id);
  }
}

export async function forgetTree(pass: Pick<TreePass, 'client' | 'wrapUp'>, decision: ForgetDecision): Promise<void> {
  const children = decision.children;
  const root = decision.root;

  // A sub-session takes its parent's pin, and atc refuses to forget one under a pinned parent.
  try {
    await pass.client.unpin(root.id);
  } catch (error) {
    pass.wrapUp.failed.push({ id: root.id, reason: `unpin: ${toErrorMessage(error)}` });
    return;
  }
  for (const child of children) {
    try {
      await forgetWrappedSession(pass.client, child.id);
      pass.wrapUp.forgotten.push(child.id);
    } catch (error) {
      pass.wrapUp.failed.push({ id: child.id, reason: toErrorMessage(error) });
    }
  }
  if (!decision.destroyImp) {
    try {
      await forgetWrappedSession(pass.client, root.id);
      pass.wrapUp.forgotten.push(root.id);
    } catch (error) {
      pass.wrapUp.failed.push({ id: root.id, reason: toErrorMessage(error) });
    }
    return;
  }
  await removeImpSession(pass, root.id);
}

async function removeImpSession(pass: Pick<TreePass, 'client' | 'wrapUp'>, id: string): Promise<void> {
  try {
    const forgotten = await forgetImpSession(pass.client, id);
    pass.wrapUp.forgotten.push(id);
    if (forgotten.destroyed) {
      pass.wrapUp.destroyed.push(id);
    }
  } catch (error) {
    pass.wrapUp.failed.push({ id, reason: toErrorMessage(error) });
  }
}
