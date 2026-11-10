import { match } from 'ts-pattern';
import { REVIEWER } from '../runs/reviewer.ts';
import type { PRAnswer } from './types.ts';

export type OwnerRecord = { kind: PRAnswer } | { kind: 'override' } | { kind: 'ci-override'; check: string };

export interface AnswerNoticeInput {
  record: OwnerRecord;
  repo: string;
  pr: number;
  head: string | null;
  actor: string;
}

export interface AnswerNotice {
  next: string;
  text: string;
}

export function pickAnswerNotice(input: AnswerNoticeInput): AnswerNotice | null {
  if (input.actor === REVIEWER) {
    return null;
  }
  const ref = `${input.repo}#${input.pr}`;
  const recorded = input.head === null ? 'is recorded; its head could not be read.' : `is recorded at ${input.head.slice(0, 7)}.`;
  const what = match(input.record)
    .with({ kind: 'lgtm' }, () => `The owner's lgtm on ${ref} ${recorded}`)
    .with({ kind: 'override' }, () => `The owner's override of the open findings on ${ref} ${recorded}`)
    .with({ kind: 'ci-override' }, (record) => `The owner's override of the ${record.check} check on ${ref} ${recorded}`)
    .with({ kind: 'changes' }, () => null)
    .with({ kind: 'reject' }, () => null)
    .exhaustive();
  if (what === null) {
    return null;
  }
  return { next: REVIEWER, text: `${what} Run \`hq review gate ${input.repo} ${input.pr}\`, and merge if it passes.` };
}
