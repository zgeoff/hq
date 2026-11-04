import { match } from 'ts-pattern';
import type { ImpWork, WrapUpPlan } from './types.ts';

// An imp goes only when its check found all work pushed; otherwise the session stays with its
// sub-sessions, since they live in the same imp. A local session is never destroyed, but it goes
// only on the same proof.
export function buildWrapUpPlan(rootID: string, childIDs: string[], work: ImpWork, place: 'imp' | 'local'): WrapUpPlan {
  const home = place === 'imp' ? 'its imp' : 'its working directory';
  const stays = place === 'imp' ? 'the imp stays' : 'the session stays';
  return match(work)
    .with({ state: 'pushed' }, (): WrapUpPlan => ({ kind: 'forget', destroyImp: place === 'imp' }))
    .with({ state: 'unpushed' }, (found) => buildKeepPlan(rootID, childIDs, `${home} holds unpushed work (${found.detail}), so ${stays}`))
    .with({ state: 'unknown' }, (found) => buildKeepPlan(rootID, childIDs, `the unpushed-work check could not run (${found.detail}), so ${stays}`))
    .exhaustive();
}

function buildKeepPlan(rootID: string, childIDs: string[], reason: string): WrapUpPlan {
  return { kind: 'keep', kept: [{ id: rootID, reason }, ...childIDs.map((id) => ({ id, reason: 'its parent session stays' }))] };
}
