import { match } from 'ts-pattern';
import type { ImpWork, WrapUpPlan } from './types.ts';

// Decides what the wrap-up does with one session and its sub-sessions. A local session's work
// (null) needs no check. An imp goes only when its check found all work pushed; otherwise the
// session stays with its sub-sessions, since they live in the same imp.
export function buildWrapUpPlan(rootID: string, childIDs: string[], work: ImpWork | null): WrapUpPlan {
  return match(work)
    .with(null, (): WrapUpPlan => ({ kind: 'forget', destroyImp: false }))
    .with({ state: 'pushed' }, (): WrapUpPlan => ({ kind: 'forget', destroyImp: true }))
    .with({ state: 'unpushed' }, (found) => buildKeepPlan(rootID, childIDs, `its imp holds unpushed work (${found.detail}), so the imp stays`))
    .with({ state: 'unknown' }, (found) => buildKeepPlan(rootID, childIDs, `the unpushed-work check could not run (${found.detail}), so the imp stays`))
    .exhaustive();
}

function buildKeepPlan(rootID: string, childIDs: string[], reason: string): WrapUpPlan {
  return { kind: 'keep', kept: [{ id: rootID, reason }, ...childIDs.map((id) => ({ id, reason: 'its parent session stays' }))] };
}
