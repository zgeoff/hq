interface PartSessionRow {
  issue: string;
  session_id: string;
  helper: number;
  active: number;
  design_pass: number;
  runState: string;
}

interface PartPrRow {
  issue: string;
  state: string;
  session_id: string | null;
}

export interface PartSessionActivity {
  atcState: string | null;
  lastActivityAt: number | null;
}

export interface PartSessionInput {
  sessions: readonly PartSessionRow[];
  prs: readonly PartPrRow[];
  activity: ReadonlyMap<string, PartSessionActivity>;
  wrapped: ReadonlySet<string>;
  nowMs: number;
  quietMs: number;
}

export interface PartSessionWrap {
  issue: string;
  session_id: string;
}

// A helper session of a part wraps up once every PR it owns has merged or closed and one merged. A
// PR with no owner or another owner never blocks it. Unknown activity counts as not idle.
export function collectPartSessionWraps(input: PartSessionInput): PartSessionWrap[] {
  return input.sessions
    .filter((session) => ['working', 'blocked'].includes(session.runState) && session.helper === 1 && session.active === 1 && session.design_pass === 0)
    .filter((session) => !input.wrapped.has(session.session_id))
    .filter((session) => isOwnedWorkDone(session, input.prs) && isIdle(input.activity.get(session.session_id), input.nowMs, input.quietMs))
    .map((session) => ({ issue: session.issue, session_id: session.session_id }));
}

function isOwnedWorkDone(session: PartSessionRow, prs: readonly PartPrRow[]): boolean {
  const owned = prs.filter((pr) => pr.issue === session.issue && pr.session_id !== null && isSameSession(pr.session_id, session.session_id));
  return owned.some((pr) => pr.state === 'merged') && owned.every((pr) => pr.state === 'merged' || pr.state === 'closed');
}

function isSameSession(owner: string, stored: string): boolean {
  const left = owner.toLowerCase();
  const right = stored.toLowerCase();
  return left.startsWith(right) || right.startsWith(left);
}

function isIdle(activity: PartSessionActivity | undefined, nowMs: number, quietMs: number): boolean {
  if (activity === undefined || activity.atcState === null || activity.lastActivityAt === null) {
    return false;
  }
  return activity.atcState !== 'running' && nowMs - activity.lastActivityAt >= quietMs;
}
