import { HqError } from '../errors.ts';
import type { HealthProblemAction, HealthProblemState } from './health-problem-transitions.ts';
import { HEALTH_PROBLEM_TRANSITIONS } from './health-problem-transitions.ts';
import type { OpenProblems } from './pick-health-moves.ts';

export function checkHealthProblem(key: string, action: HealthProblemAction, from: HealthProblemState): void {
  const allowed: readonly HealthProblemState[] = HEALTH_PROBLEM_TRANSITIONS[action].from;
  if (!allowed.includes(from)) throw new HqError('bad_state', `health problem ${key} is ${from}: ${action} needs ${allowed.join(' or ')}`, { state: from });
}

export function readHealthProblemState(open: OpenProblems, key: string): HealthProblemState {
  const entry = open[key];
  if (entry === undefined) return 'none';
  if (entry.escalated === true) return 'escalated';
  return entry.asked === undefined ? 'reported' : 'asked';
}
