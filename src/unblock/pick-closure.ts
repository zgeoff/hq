import type { ConditionVerdict, DoneWhen } from './types.ts';

interface ReadCondition {
  condition: DoneWhen;
  verdict: ConditionVerdict;
}

interface ReadSubject {
  ref: string;
  verdict: ConditionVerdict;
}

type Closure = { to: 'done'; note: string } | { to: 'dropped'; note: string } | { to: 'open' };

export function pickClosure(conditions: ReadCondition[], subject: ReadSubject | null): Closure {
  for (const read of conditions) {
    if (read.verdict.kind === 'settled') {
      return { to: 'done', note: `settled: ${read.condition.kind}:${read.condition.ref} ${read.verdict.what}` };
    }
  }
  if (subject?.verdict.kind === 'settled') {
    return { to: 'dropped', note: `${subject.ref} ${subject.verdict.what} on GitHub` };
  }
  return { to: 'open' };
}
