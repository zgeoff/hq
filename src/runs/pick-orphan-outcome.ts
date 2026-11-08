import invariant from 'tiny-invariant';
import { buildWrapUpPlan } from './build-wrap-up-plan.ts';
import type { ImpWork } from './types.ts';

export type OrphanOutcome = { kind: 'keep'; reason: string } | { kind: 'forget'; destroyImp: boolean };

// An orphan is checked alone, as its children were checked before it.
export function pickOrphanOutcome(sessionID: string, work: ImpWork, place: 'imp' | 'local'): OrphanOutcome {
  const plan = buildWrapUpPlan(sessionID, [], work, place);
  if (plan.kind === 'forget') {
    return plan;
  }
  const kept = plan.kept.find((session) => session.id === sessionID);
  invariant(kept, 'a keep plan always lists its root');
  return { kind: 'keep', reason: kept.reason };
}
