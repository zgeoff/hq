import type { KeptSession, WrapUp } from './types.ts';

export interface HandedInFacts {
  ids: readonly string[];
  wrapUp: WrapUp;
  lastKeptData: string | null;
  mergedClaimed: boolean;
}

type KeptOutcome = Pick<WrapUp, 'kept' | 'failed'>;

export interface HandedInPlan {
  end: string[];
  kept: KeptOutcome | null;
  report: boolean;
  tryMergedUpdate: boolean;
}

// A sweep retries a kept session, so the same outcome is reported once, unless this pass claimed
// the run's merged wrap-up and owes its result.
export function buildHandedInPlan(facts: HandedInFacts): HandedInPlan {
  const end = facts.ids.filter((id) => facts.wrapUp.forgotten.some((gone) => gone.startsWith(id) || id.startsWith(gone)));
  const outcome = buildKeptOutcome(facts.wrapUp);
  return {
    end,
    kept: end.length < facts.ids.length ? outcome : null,
    report: end.length > 0 || facts.mergedClaimed || !isSameOutcome(outcome, facts.lastKeptData),
    tryMergedUpdate: end.length > 0,
  };
}

function buildKeptOutcome(wrapUp: WrapUp): KeptOutcome {
  return { kept: wrapUp.kept.toSorted(compareByID), failed: wrapUp.failed.toSorted(compareByID) };
}

function compareByID(left: KeptSession, right: KeptSession): number {
  return left.id.localeCompare(right.id);
}

// The event's data is the outcome as written, so the two compare as JSON text.
function isSameOutcome(outcome: KeptOutcome, lastKeptData: string | null): boolean {
  return JSON.stringify(outcome) === lastKeptData;
}
