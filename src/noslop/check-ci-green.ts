import { match } from 'ts-pattern';
import type { GateCheck } from './read-gate-facts.ts';

export type CIVerdict = { green: true } | { green: false; reason: string };

const NOSLOP_CHECK = 'noslop';

// noslop's own check is skipped because the gate reads noslop's findings itself. GitHub keeps a
// re-run in the rollup beside the run it replaced.
export function checkCIGreen(checks: readonly GateCheck[]): CIVerdict {
  const counted = pickNewestRuns(checks).filter((check) => pickName(check) !== NOSLOP_CHECK);
  if (counted.length === 0) {
    return { green: false, reason: 'the head has no CI checks, so CI has not passed' };
  }
  const failing = counted.filter((check) => !isPassing(check)).map((check) => `${pickName(check)} (${pickState(check)})`);
  return failing.length === 0 ? { green: true } : { green: false, reason: `CI is not green: ${failing.join(', ')}` };
}

function pickNewestRuns(checks: readonly GateCheck[]): GateCheck[] {
  const newest = new Map<string, GateCheck>();
  for (const check of checks) {
    const key = pickKey(check);
    const held = newest.get(key);
    const age = held === undefined ? 1 : compareAge(check, held);
    if (age > 0 || (age === 0 && !isPassing(check))) {
      newest.set(key, check);
    }
  }
  return [...newest.values()];
}

function pickKey(check: GateCheck): string {
  return match(check)
    .with({ __typename: 'CheckRun' }, (run) => `run:${run.workflowName ?? ''}/${run.name}`)
    .with({ __typename: 'StatusContext' }, (status) => `status:${status.context}`)
    .exhaustive();
}

function compareAge(first: GateCheck, second: GateCheck): number {
  return compareTimes(pickCompletedAt(first), pickCompletedAt(second)) || compareTimes(pickTime(first.startedAt), pickTime(second.startedAt));
}

function compareTimes(first: number, second: number): number {
  if (first === second) {
    return 0;
  }
  return first > second ? 1 : -1;
}

function pickCompletedAt(check: GateCheck): number {
  return match(check)
    .with({ __typename: 'CheckRun' }, (run) => (run.status === 'COMPLETED' ? pickTime(run.completedAt) : Number.POSITIVE_INFINITY))
    .with({ __typename: 'StatusContext' }, (status) => pickTime(status.startedAt))
    .exhaustive();
}

function pickTime(at: string | null | undefined): number {
  const parsed = at === null || at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const PASSING = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

function isPassing(check: GateCheck): boolean {
  return match(check)
    .with({ __typename: 'CheckRun' }, (run) => run.status === 'COMPLETED' && run.conclusion !== null && PASSING.has(run.conclusion))
    .with({ __typename: 'StatusContext' }, (status) => status.state === 'SUCCESS')
    .exhaustive();
}

function pickName(check: GateCheck): string {
  return match(check)
    .with({ __typename: 'CheckRun' }, (run) => run.name)
    .with({ __typename: 'StatusContext' }, (status) => status.context)
    .exhaustive();
}

function pickState(check: GateCheck): string {
  return match(check)
    .with({ __typename: 'CheckRun' }, (run) => (run.status === 'COMPLETED' ? (run.conclusion ?? 'no conclusion') : run.status))
    .with({ __typename: 'StatusContext' }, (status) => status.state)
    .exhaustive();
}
