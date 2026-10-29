import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { FleetClient, FleetSession, StaleOps } from '../fleet/types.ts';
import { buildWrapUpPlan } from './build-wrap-up-plan.ts';
import { forgetWrappedSession } from './forget-wrapped-session.ts';
import { fullSessionId } from './full-session-id.ts';
import { requireRun } from './require-run.ts';
import type { ImpWork, KeptSession, WrapUp } from './types.ts';
import { writeWrapUpNote } from './write-wrap-up-note.ts';

const sessionRowSchema = z.object({ session_id: z.string() });

export interface WrapUpDeps {
  openClient: () => Promise<FleetClient & StaleOps>;
  readImpWork: (session: FleetSession) => Promise<ImpWork>;
}

export interface WrapUpOptions {
  actor: string;

  // Decides and reports, and changes nothing in atc or the database.
  dryRun?: boolean;
}

// Forgets each of the run's sessions and their sub-sessions, then notes what it did on the run. A
// run the owner chats in keeps them all. An imp is destroyed only after its check finds all work
// pushed; otherwise its session stays, sub-sessions and all. A dry run reports the same decisions
// as what it would forget and destroy.
export async function runWrapUp(db: Database, deps: WrapUpDeps, issue: string, options: WrapUpOptions): Promise<WrapUp> {
  const run = requireRun(db, issue);
  const dryRun = options.dryRun === true;

  // A session id is on one run only, so a session removed by hand is still this run's to forget.
  const rows = db.query('SELECT session_id FROM run_sessions WHERE issue = ? ORDER BY added_at, session_id').all(issue);
  const ids = rows.map((row) => sessionRowSchema.parse(row).session_id);
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
        await wrapUpTree({ client, deps, sessions, wrapUp, placedOnImp: run.place === 'imp', dryRun }, root);
      }
    } catch (error) {
      const reason = `atc: ${toMessage(error)}`;
      wrapUp.failed.push(...ids.map((id) => ({ id, reason })));
    }
  }
  if (!dryRun) {
    writeWrapUpNote(db, issue, wrapUp, options.actor);
  }
  return wrapUp;
}

// A run may hold a short session id, so each is matched to the one atc session it starts. A
// session atc no longer lists is gone already; a prefix that several sessions start is not guessed.
async function resolveSessionIDs(ids: string[], sessions: FleetSession[], wrapUp: WrapUp): Promise<string[]> {
  const fullIDs: string[] = [];
  for (const id of ids) {
    try {
      const fullID = await fullSessionId(() => Promise.resolve(sessions), id);
      fullIDs.push(fullID);
    } catch (error) {
      if (!(error instanceof HqError && error.code === 'no_such_session')) {
        wrapUp.failed.push({ id, reason: toMessage(error) });
      }
    }
  }
  return fullIDs;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface TreePass {
  client: FleetClient & StaleOps;
  deps: WrapUpDeps;
  sessions: FleetSession[];
  wrapUp: WrapUp;
  placedOnImp: boolean;
  dryRun: boolean;
}

async function wrapUpTree(pass: TreePass, root: FleetSession): Promise<void> {
  const decision = await planTree(pass, root);
  if (decision.kind === 'keep') {
    pass.wrapUp.kept.push(...decision.kept);
    return;
  }
  if (pass.dryRun) {
    pass.wrapUp.forgotten.push(...decision.children.map((child) => child.id), root.id);
    if (decision.destroyImp) {
      pass.wrapUp.destroyed.push(root.id);
    }
    return;
  }
  await forgetTree(pass, decision);
}

type TreeDecision = { kind: 'keep'; kept: KeptSession[] } | { kind: 'forget'; children: FleetSession[]; root: FleetSession; destroyImp: boolean };

// Decides what becomes of one session tree. Only the unpushed-work check reads anything.
async function planTree(pass: TreePass, root: FleetSession): Promise<TreeDecision> {
  const children = collectChildren(pass.sessions, root.id);
  const tree = [...children, root];
  if (tree.some((session) => session.pinned === true)) {
    return { kind: 'keep', kept: tree.map((session) => ({ id: session.id, reason: 'pinned in atc' })) };
  }
  let work: ImpWork | null = null;
  if (isOnImp(root, pass.placedOnImp)) {
    work = await readImpWorkSafely(pass.deps, root);
  }
  const plan = buildWrapUpPlan(root.id, children.map((child) => child.id), work);
  if (plan.kind === 'keep') {
    return { kind: 'keep', kept: plan.kept };
  }
  return { kind: 'forget', children, root, destroyImp: plan.destroyImp };
}

// atc says where a session runs: any host but this PC is an imp. The run's place decides only when
// atc names no host.
function isOnImp(session: FleetSession, placedOnImp: boolean): boolean {
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

async function forgetTree(pass: TreePass, decision: Extract<TreeDecision, { kind: 'forget' }>): Promise<void> {
  const children = decision.children;
  const root = decision.root;

  // A sub-session takes its parent's pin, and atc refuses to forget one under a pinned parent.
  try {
    await pass.client.unpin(root.id);
  } catch (error) {
    pass.wrapUp.failed.push({ id: root.id, reason: `unpin: ${toMessage(error)}` });
    return;
  }
  for (const child of children) {
    try {
      await forgetWrappedSession(pass.client, child.id);
      pass.wrapUp.forgotten.push(child.id);
    } catch (error) {
      pass.wrapUp.failed.push({ id: child.id, reason: toMessage(error) });
    }
  }
  if (!decision.destroyImp) {
    try {
      await forgetWrappedSession(pass.client, root.id);
      pass.wrapUp.forgotten.push(root.id);
    } catch (error) {
      pass.wrapUp.failed.push({ id: root.id, reason: toMessage(error) });
    }
    return;
  }
  await removeImpSession(pass, root.id);
}

// The deepest sub-sessions come first, so each is forgotten before the session it lists under.
function collectChildren(sessions: FleetSession[], parentID: string): FleetSession[] {
  const found: FleetSession[] = [];
  for (const child of sessions.filter((session) => session.parent === parentID)) {
    found.push(...collectChildren(sessions, child.id), child);
  }
  return found;
}

async function readImpWorkSafely(deps: WrapUpDeps, session: FleetSession): Promise<ImpWork> {
  try {
    return await deps.readImpWork(session);
  } catch (error) {
    return { state: 'unknown', detail: toMessage(error) };
  }
}

// Forgets the live session, which stops it, and confirms the destroy of its imp when atc asks. A
// separate stop first would suspend a cloud imp, which outlasts the atc call.
// A failure leaves it unpinned: a pin means the session needs the owner, and this is not that.
async function removeImpSession(pass: TreePass, id: string): Promise<void> {
  try {
    const first = await pass.client.forgetLive(id);
    if (first.confirmToken === undefined) {
      if (!first.forgotten) {
        throw new Error('atc did not forget the session');
      }
      pass.wrapUp.forgotten.push(id);
      return;
    }
    const confirmed = await pass.client.forgetLive(id, first.confirmToken);
    if (!confirmed.forgotten) {
      throw new Error('atc did not forget the session after the confirmed destroy');
    }
    pass.wrapUp.forgotten.push(id);
    pass.wrapUp.destroyed.push(id);
  } catch (error) {
    pass.wrapUp.failed.push({ id, reason: toMessage(error) });
  }
}
