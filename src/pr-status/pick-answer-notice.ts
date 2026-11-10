import { match } from 'ts-pattern';
import { REVIEWER } from '../runs/reviewer.ts';
import type { PRAnswer } from './types.ts';

export type OwnerRecord = { kind: PRAnswer } | { kind: 'override' } | { kind: 'ci-override'; check: string };

export interface AnswerNoticeInput {
  record: OwnerRecord;
  repo: string;
  pr: number;
  head: string;
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
  const what = match(input.record)
    .with({ kind: 'lgtm' }, () => `The owner's lgtm on ${ref} is recorded at ${input.head.slice(0, 7)}.`)
    .with({ kind: 'override' }, () => `The owner's override of the open findings on ${ref} is recorded at ${input.head.slice(0, 7)}.`)
    .with({ kind: 'ci-override' }, (record) => `The owner's override of the ${record.check} check on ${ref} is recorded at ${input.head.slice(0, 7)}.`)
    .with({ kind: 'changes' }, () => null)
    .with({ kind: 'reject' }, () => null)
    .exhaustive();
  if (what === null) {
    return null;
  }
  return { next: REVIEWER, text: `${what} Run \`hq review gate ${input.repo} ${input.pr}\`, and merge if it passes.` };
}
