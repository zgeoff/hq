import { isOneOf } from '@zgeoff/std';
import type { RunState } from '../transitions/run-states.ts';

const ASLEEP_END_RUN_STATES = ['working', 'blocked'] as const;

export interface AsleepSessionFacts {
  asleep: boolean;
  runState: RunState;
  scopeHeld: boolean;
  merged: number;
  open: number;
  ageMs: number;
  graceMs: number;
}

// An asleep session of a run whose PRs have all merged has nothing left to do, and atc lists it
// for as long as it sleeps. A run held for open Scope boxes stays working, so its session stays.
export function isAsleepOfMergedRun(facts: AsleepSessionFacts): boolean {
  return facts.asleep && !facts.scopeHeld && isOneOf(facts.runState, ASLEEP_END_RUN_STATES) && facts.merged > 0 && facts.open === 0 && facts.ageMs > facts.graceMs;
}
